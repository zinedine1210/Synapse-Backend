import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { SyncUserDto } from './dto/sync-user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Sinkronisasi/buat user di database lokal berdasarkan identitas Supabase Auth.
   * Menggunakan upsert agar aman dipanggil berkali-kali.
   */
  async syncUser(supabaseUserId: string, dto: SyncUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: supabaseUserId } });
    const isNewUser = !existing;

    const user = await this.prisma.user.upsert({
      where: { id: supabaseUserId },
      update: {
        fullName: dto.fullName,
        avatarUrl: dto.avatarUrl,
      },
      create: {
        id: supabaseUserId,
        email: dto.email,
        fullName: dto.fullName,
        avatarUrl: dto.avatarUrl,
      },
    });

    // Welcome notification for new users
    if (isNewUser) {
      this.notificationService.createNotification(
        user.id,
        '👋 Selamat datang di Synapse!',
        `Hai ${dto.fullName?.split(' ')[0] || 'kamu'}! Mulai catat keuanganmu, gabung kelas, dan jelajahi fitur AI. Selamat beraktivitas!`,
        { category: 'system', actionUrl: '/dashboard' },
      ).catch(() => {});
    }

    this.logger.log(`User disinkronkan: ${user.email}`);
    return { message: 'User berhasil disinkronkan.', user };
  }

  /**
   * Mark onboarding as completed for a user.
   */
  async completeOnboarding(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
    return { message: 'Onboarding selesai.' };
  }
}
