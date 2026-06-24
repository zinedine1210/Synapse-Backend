import {
  CanActivate,
  ExecutionContext,
  Injectable,
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

const USER_CACHE_TTL = 2 * 60 * 1000;
const TOKEN_CACHE_TTL = 5 * 60 * 1000;

/**
 * Optional Auth Guard – populates req.user if a valid token is present,
 * but allows the request through even without authentication.
 * Uses in-memory cache to avoid DB/Supabase round-trips.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
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
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.user = null;
      return true;
    }

    const token = authHeader.split(' ')[1];

    try {
      // 1. Check token cache
      let userId: string;
      const cachedToken = this.tokenCache.get(token);
      if (cachedToken && cachedToken.expiresAt > Date.now()) {
        userId = cachedToken.userId;
      } else {
        const { data, error } = await this.supabase.auth.getUser(token);
        if (error || !data.user) {
          request.user = null;
          return true;
        }
        userId = data.user.id;
        this.tokenCache.set(token, { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL });
      }

      // 2. Check user cache
      const cachedUser = this.userCache.get(userId);
      if (cachedUser && cachedUser.expiresAt > Date.now()) {
        request.user = cachedUser.data;
        return true;
      }

      // 3. Fetch from DB
      const localUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { pricingPlan: true },
      });

      if (localUser) {
        this.userCache.set(userId, { data: localUser, expiresAt: Date.now() + USER_CACHE_TTL });
      }
      request.user = localUser || null;
    } catch {
      request.user = null;
    }

    return true;
  }
}
