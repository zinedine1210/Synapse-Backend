import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SyncUserDto } from './dto/sync-user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sinkronisasi/buat user di database lokal berdasarkan identitas Supabase Auth.
   * Menggunakan upsert agar aman dipanggil berkali-kali.
   */
  async syncUser(supabaseUserId: string, dto: SyncUserDto) {
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
