import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * AI Rate Limit Guard – membatasi jumlah panggilan AI per user per hari.
 * Mencegah penyalahgunaan/spam yang bisa menghabiskan token Gemini API.
 *
 * Limit diambil dari PricingPlan.aiRequestLimit di database.
 * Fallback: 20 request/hari jika plan tidak ditemukan.
 * SUPERADMIN: unlimited.
 */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AiRateLimitGuard.name);

  // In-memory counter (reset setiap hari otomatis lewat date check)
  private readonly dailyCounts = new Map<string, { count: number; date: string }>();

  private readonly FALLBACK_LIMIT = 20;

  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true; // AuthGuard akan handle ini

    // Superadmin tidak dibatasi
    if (user.role === 'SUPERADMIN') return true;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `${user.id}`;
    const entry = this.dailyCounts.get(key);

    let currentCount = 0;
    if (entry && entry.date === today) {
      currentCount = entry.count;
    }

    // Ambil limit dari PricingPlan di database
    const limit = user.pricingPlan?.aiRequestLimit ?? this.FALLBACK_LIMIT;
    const planName = user.pricingPlan?.name ?? 'Unknown';

    if (currentCount >= limit) {
      this.logger.warn(
        `User ${user.id} (${planName}) exceeded daily AI limit: ${currentCount}/${limit}`,
      );
      throw new HttpException(
        {
          message: `Anda telah mencapai batas penggunaan AI harian (${limit} request/hari untuk paket ${planName}). Silakan coba lagi besok atau upgrade paket Anda.`,
          limit,
          used: currentCount,
          remaining: 0,
          plan: planName,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    this.dailyCounts.set(key, { count: currentCount + 1, date: today });

    // Cleanup: hapus entry dari hari kemarin (prevent memory leak)
    if (this.dailyCounts.size > 10000) {
      for (const [k, v] of this.dailyCounts) {
        if (v.date !== today) this.dailyCounts.delete(k);
      }
    }

    return true;
  }
}
