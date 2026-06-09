import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';

/**
 * JWT Auth Guard – memvalidasi token Bearer dari Supabase Auth.
 * Jika token valid, data user (id, email, role, plan) disisipkan ke req.user.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly supabase;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token autentikasi tidak ditemukan.');
    }

    const token = authHeader.split(' ')[1];

    // Verifikasi token ke Supabase Auth
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      this.logger.warn(`Token tidak valid: ${error?.message}`);
      throw new UnauthorizedException('Token tidak valid atau sudah kadaluarsa.');
    }

    // Ambil data user dari database lokal (termasuk role & plan)
    const localUser = await this.prisma.user.findUnique({
      where: { id: data.user.id },
      include: { pricingPlan: true },
    });

    if (!localUser) {
      // Izinkan sinkronisasi user jika route-nya adalah sync-user
      const isSyncRoute = request.url?.includes('/auth/sync-user') || request.path?.includes('/auth/sync-user');
      if (isSyncRoute) {
        request.user = { id: data.user.id } as any;
        return true;
      }

      throw new UnauthorizedException(
        'Akun tidak ditemukan. Silakan registrasi ulang.',
      );
    }

    // Sisipkan ke request object agar controller bisa langsung pakai
    request.user = localUser;

    return true;
  }
}
