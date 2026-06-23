import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';

/**
 * Optional Auth Guard – populates req.user if a valid token is present,
 * but allows the request through even without authentication.
 * Used for public endpoints that optionally personalize content for logged-in users.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
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
      request.user = null;
      return true;
    }

    const token = authHeader.split(' ')[1];

    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      if (error || !data.user) {
        request.user = null;
        return true;
      }

      const localUser = await this.prisma.user.findUnique({
        where: { id: data.user.id },
        include: { pricingPlan: true },
      });

      request.user = localUser || null;
    } catch {
      request.user = null;
    }

    return true;
  }
}
