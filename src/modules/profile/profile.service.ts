import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  validateAvatarFile,
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_SIZE_BYTES,
} from './validate-avatar-file';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  /**
   * Get user profile + onboarding data.
   * Creates a UserProfile record if it doesn't exist yet.
   */
  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return profile;
  }

  /**
   * Update profile fields (onboarding data + AI context).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...(dto.university !== undefined && { university: dto.university }),
        ...(dto.hobbies !== undefined && { hobbies: dto.hobbies }),
        ...(dto.job !== undefined && { job: dto.job }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.dailyHabits !== undefined && { dailyHabits: dto.dailyHabits }),
        ...(dto.lifeGoals !== undefined && { lifeGoals: dto.lifeGoals }),
        ...(dto.studySchedule !== undefined && { studySchedule: dto.studySchedule }),
        ...(dto.personalNotes !== undefined && { personalNotes: dto.personalNotes }),
      },
      create: {
        userId,
        ...(dto.university !== undefined && { university: dto.university }),
        ...(dto.hobbies !== undefined && { hobbies: dto.hobbies }),
        ...(dto.job !== undefined && { job: dto.job }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.dailyHabits !== undefined && { dailyHabits: dto.dailyHabits }),
        ...(dto.lifeGoals !== undefined && { lifeGoals: dto.lifeGoals }),
        ...(dto.studySchedule !== undefined && { studySchedule: dto.studySchedule }),
        ...(dto.personalNotes !== undefined && { personalNotes: dto.personalNotes }),
      },
    });

    return profile;
  }

  /**
   * Validate and upload avatar to Supabase Storage.
   * Updates User.avatarUrl (source of truth across app) and UserProfile.avatarUrl.
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // Validate file presence
    if (!file) {
      throw new BadRequestException('File tidak ditemukan dalam request.');
    }

    // Validate file metadata using shared utility
    if (!validateAvatarFile(file.size, file.mimetype)) {
      if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException('Format file tidak didukung');
      }
      if (file.size > MAX_AVATAR_SIZE_BYTES) {
        throw new HttpException(
          { error: 'Ukuran file melebihi batas 2MB' },
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
    }

    // Ensure 'avatars' bucket exists
    await this.ensureBucketExists('avatars');

    // Determine file extension
    const ext = file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : file.mimetype.split('/')[1];
    const fileName = `${userId}/avatar-${Date.now()}.${ext}`;

    // Remove old avatar if exists
    await this.removeOldAvatarFiles(userId);

    // Upload to Supabase Storage
    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      this.logger.error('Gagal upload avatar ke Supabase Storage:', uploadError);
      throw new BadRequestException(
        `Gagal mengunggah foto: ${uploadError.message || 'Pastikan bucket "avatars" sudah dibuat di Supabase Storage.'}`,
      );
    }

    // Get public URL
    const { data: publicUrlData } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const avatarUrl = publicUrlData.publicUrl;

    // Update User.avatarUrl (main source of truth)
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    // Update UserProfile.avatarUrl as well
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { avatarUrl },
      create: { userId, avatarUrl },
    });

    return { avatarUrl };
  }

  /**
   * Remove avatar from Supabase Storage and clear URL from DB.
   */
  async deleteAvatar(userId: string) {
    // Remove files from storage
    await this.removeOldAvatarFiles(userId);

    // Clear avatarUrl in User table
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    // Clear avatarUrl in UserProfile
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { avatarUrl: null },
      create: { userId },
    });

    return { message: 'Avatar berhasil dihapus.' };
  }

  /**
   * Remove all avatar files for a user from Supabase Storage.
   */
  private async removeOldAvatarFiles(userId: string) {
    try {
      const { data: files } = await this.supabase.storage
        .from('avatars')
        .list(userId);

      if (files && files.length > 0) {
        const filePaths = files.map((f) => `${userId}/${f.name}`);
        await this.supabase.storage.from('avatars').remove(filePaths);
      }
    } catch (err) {
      this.logger.warn(`Gagal membersihkan avatar lama: ${err}`);
    }
  }

  /**
   * Ensure a storage bucket exists; create if missing.
   */
  private async ensureBucketExists(bucketName: string) {
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) {
        this.logger.error(`Gagal list bucket: ${listError.message}`);
        return;
      }

      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        this.logger.log(`Bucket '${bucketName}' tidak ditemukan. Membuat bucket...`);
        const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
          public: true,
        });
        if (createError) {
          this.logger.error(`Gagal membuat bucket '${bucketName}': ${createError.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Error ensuring bucket: ${err}`);
    }
  }
}
