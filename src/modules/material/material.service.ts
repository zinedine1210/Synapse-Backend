import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationService } from '../notification/notification.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number; info: any }>;

// Tipe file yang diizinkan
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'audio/mpeg',
  'audio/m4a',
  'audio/mp4',
];

// Batas ukuran file
const MAX_FILE_SIZE_PDF_MB = 10;
const MAX_FILE_SIZE_AUDIO_MB = 25;

@Injectable()
export class MaterialService {
  private readonly logger = new Logger(MaterialService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async uploadMaterial(user: User, file: Express.Multer.File, sessionId: string) {
    // ─── Validasi file ───────────────────────────────────────────────────────
    if (!file) throw new BadRequestException('File tidak ditemukan dalam request.');

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipe file tidak diizinkan. Gunakan: PDF, DOCX, PPT, JPG, PNG, MP3, M4A.`,
      );
    }

    // ─── Cek kuota upload user ───────────────────────────────────────────────
    const pricingPlan = await this.prisma.pricingPlan.findUnique({
      where: { name: user.plan },
    });

    const isAudio = file.mimetype.startsWith('audio/');
    const maxSizeMb = pricingPlan ? pricingPlan.maxFileSizeMb : (isAudio ? MAX_FILE_SIZE_AUDIO_MB : MAX_FILE_SIZE_PDF_MB);
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new BadRequestException(`Ukuran file melebihi batas ${maxSizeMb} MB.`);
    }

    if (pricingPlan && user.uploadCount >= pricingPlan.maxUploadPerMonth) {
      throw new ForbiddenException(
        `Kuota upload bulan ini habis (${pricingPlan.maxUploadPerMonth} file). Silakan tingkatkan paket Anda untuk kuota lebih besar!`,
      );
    }

    // ─── Upload ke Supabase Storage ──────────────────────────────────────────
    // Sanitize filename: strip path traversal, special chars
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.');
    const fileName = `${user.id}/${sessionId}/${Date.now()}-${safeName}`;
    
    // Pastikan bucket materials ada di Supabase
    await this.ensureBucketExists('materials');

    const { data: storageData, error: storageError } = await this.supabase.storage
      .from('materials')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (storageError) {
      this.logger.error('Gagal upload ke Supabase Storage:', storageError);
      throw new BadRequestException('Gagal mengunggah file. Coba lagi.');
    }

    const { data: publicUrlData } = this.supabase.storage
      .from('materials')
      .getPublicUrl(fileName);

    const isImage = file.mimetype.startsWith('image/');
    const fileType = isAudio ? 'AUDIO' : (isImage ? 'IMAGE' : 'PDF');

    // ─── Simpan record Material ke DB dengan status PROCESSING ───────────────
    const material = await this.prisma.material.create({
      data: {
        sessionId,
        fileName: file.originalname,
        fileUrl: publicUrlData.publicUrl,
        fileType,
        fileSizeBytes: file.size,
        status: 'PROCESSING',
      },
    });

    // Tambah hitungan upload user
    await this.prisma.user.update({
      where: { id: user.id },
      data: { uploadCount: { increment: 1 } },
    });

    // ─── Proses AI secara asinkronus (non-blocking) ──────────────────────────
    // Tidak di-await agar request langsung return 202
    this.processAiInBackground(material.id, file.buffer, file.mimetype, user.id, sessionId, file.originalname).catch(
      (err) => this.logger.error(`Background AI processing gagal untuk material ${material.id}:`, err),
    );

    this.logger.log(`Material ${material.id} diunggah, AI processing dimulai...`);

    return {
      message: 'File berhasil diunggah. AI sedang memproses rangkuman...',
      materialId: material.id,
      status: 'PROCESSING',
    };
  }

  /** Proses AI secara asinkronus di background */
  private async processAiInBackground(
    materialId: string,
    fileBuffer: Buffer,
    mimeType: string,
    uploaderId: string,
    sessionId: string,
    fileName: string,
  ): Promise<void> {
    try {
      let rawText = '';
      let summary = '';

      if (mimeType === 'application/pdf') {
        // 1. Ekstrak teks konten dari PDF menggunakan pdf-parse
        const pdfData = await pdfParse(fileBuffer);
        rawText = pdfData.text;

        // 2. Ekstrak gambar dari PDF menggunakan carver
        const extractedImageUrls: { buffer: Buffer; mimeType: string; url: string }[] = [];
        try {
          const extractedImages = this.extractImagesFromPdfBuffer(fileBuffer);
          this.logger.log(`Berhasil mengekstrak ${extractedImages.length} gambar dari PDF ${materialId}`);

          // Batasi maksimal 10 gambar
          const limitImages = extractedImages.slice(0, 10);
          for (let i = 0; i < limitImages.length; i++) {
            const img = limitImages[i];
            const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
            const imgFileName = `extracted/${materialId}/image-${i + 1}-${Date.now()}.${ext}`;

            const { error: uploadErr } = await this.supabase.storage
              .from('materials')
              .upload(imgFileName, img.buffer, { contentType: img.mimeType });

            if (!uploadErr) {
              const { data: urlData } = this.supabase.storage
                .from('materials')
                .getPublicUrl(imgFileName);
              
              extractedImageUrls.push({
                buffer: img.buffer,
                mimeType: img.mimeType,
                url: urlData.publicUrl,
              });
            } else {
              this.logger.error(`Gagal upload gambar hasil ekstrak ke Supabase:`, uploadErr);
            }
          }
        } catch (imgErr) {
          this.logger.error('Gagal mengekstrak gambar dari PDF:', imgErr);
        }

        if (!rawText || rawText.trim().length < 10) {
          rawText = 'Konten PDF tidak mengandung teks (kemungkinan hasil scan gambar).';
        }
        rawText = rawText.slice(0, 50000);

        // Panggil AI dengan teks dan gambar
        summary = await this.aiService.summarizeMaterial(rawText, extractedImageUrls);

      } else if (mimeType.startsWith('image/')) {
        // Tipe gambar langsung
        const base64 = fileBuffer.toString('base64');
        rawText = await this.aiService.ocrImage(base64, mimeType);

        // Ambil URL public dari data DB
        const materialRecord = await this.prisma.material.findUnique({
          where: { id: materialId },
        });

        const imageUrl = materialRecord?.fileUrl || '';
        const imgDescription = await this.aiService.summarizeMaterial(
          `Ini adalah file gambar yang diunggah sebagai materi kuliah. Berikut adalah teks hasil OCR dari gambar tersebut:\n${rawText}`
        );

        summary = `![Gambar Materi](${imageUrl})\n\n${imgDescription}`;
      } else {
        // Fallback untuk tipe file lain (DOCX, dll)
        rawText = fileBuffer.toString('utf-8');
        if (!rawText || rawText.trim().length < 10) {
          throw new Error('Teks yang diekstrak dari file terlalu pendek atau kosong.');
        }
        rawText = rawText.slice(0, 50000);
        summary = await this.aiService.summarizeMaterial(rawText);
      }

      await this.prisma.material.update({
        where: { id: materialId },
        data: { status: 'SUCCESS', aiSummary: summary },
      });

      this.logger.log(`AI processing selesai untuk material ${materialId}`);

      // Notify uploader that digitization is done
      try {
        await this.notificationService.createNotification(
          uploaderId,
          'Digitalisasi Selesai',
          `Materi "${fileName}" berhasil didigitalisasi oleh AI.`,
        );
        // Notify other class members about new material
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: { classId: true, title: true },
        });
        if (session) {
          await this.notificationService.notifyClassMembers(
            session.classId,
            uploaderId,
            'Materi Baru',
            `Materi "${fileName}" telah diupload di ${session.title}.`,
          );
        }
      } catch (notifErr) {
        this.logger.warn('Failed to send notification:', notifErr);
      }
    } catch (error) {
      await this.prisma.material.update({
        where: { id: materialId },
        data: {
          status: 'FAILED',
          errorMsg: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  /** Hapus material dan file di storage */
  async deleteMaterial(materialId: string, userId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: {
        session: {
          include: { class: { include: { members: { where: { userId } } } } },
        },
      },
    });

    if (!material) throw new NotFoundException('Material tidak ditemukan.');
    if (material.session.class.members.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke material ini.');
    }

    // Hapus file dari Supabase Storage
    if (material.fileUrl) {
      try {
        const url = new URL(material.fileUrl);
        const pathParts = url.pathname.split('/storage/v1/object/public/materials/');
        if (pathParts[1]) {
          await this.supabase.storage.from('materials').remove([decodeURIComponent(pathParts[1])]);
        }
      } catch (err) {
        this.logger.warn(`Gagal menghapus file dari storage: ${err}`);
      }
    }

    await this.prisma.material.delete({ where: { id: materialId } });
    this.logger.log(`Material ${materialId} dihapus oleh user ${userId}`);

    return { message: 'Material berhasil dihapus.' };
  }

  /** Cek status processing AI dan ambil hasil rangkuman */
  async getMaterialStatus(materialId: string, userId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: {
        session: {
          include: { class: { include: { members: { where: { userId } } } } },
        },
      },
    });

    if (!material) throw new NotFoundException('Material tidak ditemukan.');

    if (material.session.class.members.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke material ini.');
    }

    return {
      id: material.id,
      fileName: material.fileName,
      fileType: material.fileType,
      status: material.status,
      aiSummary: material.aiSummary,
      errorMsg: material.errorMsg,
      createdAt: material.createdAt,
    };
  }

  /** Memastikan bucket ada di Supabase Storage */
  private async ensureBucketExists(bucketName: string) {
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) {
        this.logger.error(`Gagal mendapatkan list bucket: ${listError.message}`);
        return;
      }

      const bucketExists = buckets.some((b) => b.name === bucketName);
      if (!bucketExists) {
        this.logger.log(`Bucket '${bucketName}' tidak ditemukan. Membuat bucket...`);
        const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
          public: true,
        });
        if (createError) {
          this.logger.error(`Gagal membuat bucket '${bucketName}': ${createError.message}`);
        } else {
          this.logger.log(`Bucket '${bucketName}' berhasil dibuat.`);
        }
      }
    } catch (err) {
      this.logger.error(`Error saat memastikan bucket '${bucketName}' ada:`, err);
    }
  }

  private extractImagesFromPdfBuffer(pdfBuffer: Buffer): { buffer: Buffer; mimeType: string }[] {
    const images: { buffer: Buffer; mimeType: string }[] = [];
    let pos = 0;
    
    while (pos < pdfBuffer.length) {
      const streamIdx = pdfBuffer.indexOf('stream', pos);
      if (streamIdx === -1) break;
      
      let startIdx = streamIdx + 6;
      if (pdfBuffer[startIdx] === 0x0d) startIdx++; // \r
      if (pdfBuffer[startIdx] === 0x0a) startIdx++; // \n
      
      const endstreamIdx = pdfBuffer.indexOf('endstream', startIdx);
      if (endstreamIdx === -1) {
        pos = startIdx;
        continue;
      }
      
      const streamContent = pdfBuffer.subarray(startIdx, endstreamIdx);
      
      // JPEG check: starts with 0xFFD8
      if (streamContent[0] === 0xff && streamContent[1] === 0xd8) {
        images.push({
          buffer: streamContent,
          mimeType: 'image/jpeg'
        });
      }
      // PNG check: starts with 0x89504E47
      else if (
        streamContent[0] === 0x89 &&
        streamContent[1] === 0x50 &&
        streamContent[2] === 0x4e &&
        streamContent[3] === 0x47
      ) {
        images.push({
          buffer: streamContent,
          mimeType: 'image/png'
        });
      }
      
      pos = endstreamIdx + 9;
    }
    return images;
  }
}
