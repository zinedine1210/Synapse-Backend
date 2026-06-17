import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { GeneratePredictionDto } from './dto/generate-prediction.dto';

@Injectable()
export class ExamPredictionService {
  private readonly logger = new Logger(ExamPredictionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly aiJob: AiJobService,
  ) {}

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }

  /** Ambil semua prediksi ujian di satu kelas */
  async getClassPredictions(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });

    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');

    return this.prisma.examPrediction.findMany({
      where: { classId },
      orderBy: { createdAt: 'desc' },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    });
  }

  /** Ambil detail satu prediksi ujian */
  async getPredictionById(id: string, userId: string) {
    const prediction = await this.prisma.examPrediction.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        class: { include: { members: { where: { userId } } } },
      },
    });

    if (!prediction) throw new NotFoundException('Prediksi tidak ditemukan.');
    if (prediction.class.members.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke prediksi ini.');
    }

    return prediction;
  }

  /** Buat prediksi ujian secara manual */
  async createManualPrediction(classId: string, userId: string, dto: CreatePredictionDto) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });

    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'PREDICTION_MANAGE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk membuat prediksi ujian.');
    }

    return this.prisma.examPrediction.create({
      data: {
        classId,
        title: dto.title,
        description: dto.description,
        createdById: userId,
        sessionIds: dto.sessionIds,
        source: dto.source,
        questions: {
          create: dto.questions.map((q, idx) => ({
            type: q.type,
            question: q.question,
            options: q.options,
            answerKey: q.answerKey,
            explanation: q.explanation,
            order: idx + 1,
          })),
        },
      },
      include: { questions: true },
    });
  }

  /** AI Generate prediksi ujian dari materi pertemuan */
  async generatePrediction(classId: string, userId: string, dto: GeneratePredictionDto) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });

    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'PREDICTION_MANAGE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk meng-generate prediksi ujian.');
    }

    // Ambil materi dari pertemuan terpilih
    const sessions = await this.prisma.session.findMany({
      where: { id: { in: dto.sessionIds }, classId },
      include: { materials: true },
    });

    let context = '';
    for (const s of sessions) {
      context += `\nPertemuan: ${s.title}\n`;
      const successfulMaterials = s.materials.filter((m) => m.status === 'SUCCESS');
      for (const m of successfulMaterials) {
        if (m.aiSummary) {
          context += `- Rangkuman Materi "${m.fileName}": ${m.aiSummary}\n`;
        }
      }
    }

    if (!context.trim()) {
      context = `Topik Pertemuan:\n` + sessions.map(s => `- ${s.title}`).join('\n') + `\n(Gunakan pengetahuan akademis umum untuk topik-topik tersebut karena file rangkuman tidak tersedia)`;
    }

    // Panggil AI Service
    return this.aiJob.run(userId, 'exam_prediction', async () => {
    const questions = await this.aiService.generateExamPrediction(
      context,
      dto.type,
      dto.countPG,
      dto.countEssay,
    );

    // Simpan ke DB
    return this.prisma.examPrediction.create({
      data: {
        classId,
        title: dto.title,
        description: dto.description || `Dibuat otomatis oleh AI dari ${sessions.length} pertemuan`,
        createdById: userId,
        sessionIds: dto.sessionIds,
        source: 'AI_GENERATED',
        questions: {
          create: questions.map((q, idx) => ({
            type: q.type,
            question: q.question,
            options: q.options ? JSON.stringify(q.options) : null,
            answerKey: q.answerKey,
            explanation: q.explanation,
            order: idx + 1,
          })),
        },
      },
      include: { questions: true },
    });
    }); // end aiJob.run
  }

  /** Ekstrak prediksi dari foto kisi-kisi */
  async uploadPredictionImage(
    classId: string,
    userId: string,
    dto: { title: string; description?: string; base64: string; mimeType: string },
  ) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });

    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'PREDICTION_MANAGE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk mengunggah prediksi ujian.');
    }

    return this.aiJob.run(userId, 'exam_upload_image', async () => {
    const questions = await this.aiService.extractExamFromImage(dto.base64, dto.mimeType);

    return this.prisma.examPrediction.create({
      data: {
        classId,
        title: dto.title,
        description: dto.description || 'Diekstrak dari foto kisi-kisi/ujian',
        createdById: userId,
        sessionIds: [], // Foto mandiri, tidak terikat pertemuan tertentu
        source: 'UPLOADED',
        questions: {
          create: questions.map((q, idx) => ({
            type: q.type,
            question: q.question,
            options: q.options ? JSON.stringify(q.options) : null,
            answerKey: q.answerKey,
            explanation: q.explanation,
            order: idx + 1,
          })),
        },
      },
      include: { questions: true },
    });
    }); // end aiJob.run
  }

  /** Hapus prediksi ujian */
  async deletePrediction(id: string, userId: string) {
    const prediction = await this.prisma.examPrediction.findUnique({
      where: { id },
      include: {
        class: { include: { members: { where: { userId }, include: { classRole: true } } } },
      },
    });

    if (!prediction) throw new NotFoundException('Prediksi tidak ditemukan.');

    const member = prediction.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'PREDICTION_MANAGE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus prediksi ujian.');
    }

    await this.prisma.examPrediction.delete({ where: { id } });
    return { success: true };
  }
}
