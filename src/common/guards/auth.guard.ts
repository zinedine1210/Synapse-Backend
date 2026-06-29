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

interface CachedUser {
  data: any;
  expiresAt: number;
}

interface CachedToken {
  userId: string;
  expiresAt: number;
}

const USER_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * JWT Auth Guard – memvalidasi token Bearer dari Supabase Auth.
 * Menggunakan in-memory cache untuk mengurangi round-trip ke DB dan Supabase.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly supabase;
  private readonly userCache = new Map<string, CachedUser>();
  private readonly tokenCache = new Map<string, CachedToken>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Cleanup expired cache entries every 5 minutes
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token autentikasi tidak ditemukan.');
    }

    const token = authHeader.split(' ')[1];

    // 1. Check token cache first (avoid Supabase round-trip)
    let userId: string;
    const cachedToken = this.tokenCache.get(token);
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      userId = cachedToken.userId;
    } else {
      // Verify token with Supabase
      const { data, error } = await this.supabase.auth.getUser(token);
      if (error || !data.user) {
        this.tokenCache.delete(token);
        this.logger.warn(`Token tidak valid: ${error?.message}`);
        throw new UnauthorizedException('Token tidak valid atau sudah kadaluarsa.');
      }
      userId = data.user.id;
      this.tokenCache.set(token, { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL });
    }

    // 2. Check user cache (avoid DB round-trip)
    const forceRefresh = request.headers['x-force-refresh'] === '1';
    const cachedUser = this.userCache.get(userId);
    if (!forceRefresh && cachedUser && cachedUser.expiresAt > Date.now()) {
      request.user = cachedUser.data;
      return true;
    }

    // 3. Fetch from DB and cache
    const localUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { pricingPlan: true },
    });

    if (!localUser) {
      const isSyncRoute = request.url?.includes('/auth/sync-user') || request.path?.includes('/auth/sync-user');
      if (isSyncRoute) {
        request.user = { id: userId } as any;
        return true;
      }
      throw new UnauthorizedException('Akun tidak ditemukan. Silakan registrasi ulang.');
    }

    // Cache the user
    this.userCache.set(userId, { data: localUser, expiresAt: Date.now() + USER_CACHE_TTL });
    request.user = localUser;
    return true;
  }

  /** Invalidate user cache (call after plan/role changes) */
  invalidateUser(userId: string) {
    this.userCache.delete(userId);
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, val] of this.userCache) {
      if (val.expiresAt <= now) this.userCache.delete(key);
    }
    for (const [key, val] of this.tokenCache) {
      if (val.expiresAt <= now) this.tokenCache.delete(key);
    }
  }
}
