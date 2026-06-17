import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type AiFeature = 'briefing' | 'weekly_roast';

interface LimitConfig {
  field: keyof Pick<any, 'aiBriefingLimit' | 'aiWeeklyRoastLimit'>;
  period: 'day' | 'week';
  label: string;
}

const FEATURE_CONFIG: Record<AiFeature, LimitConfig> = {
  briefing: { field: 'aiBriefingLimit', period: 'day', label: 'AI Briefing' },
  weekly_roast: { field: 'aiWeeklyRoastLimit', period: 'week', label: 'Weekly Roast' },
};

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user can use the AI feature, throws ForbiddenException if limit exceeded.
   * Gracefully skips if DB tables are unavailable.
   */
  async checkAndRecord(userId: string, feature: AiFeature): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { pricingPlan: true },
      });

      if (!user || !user.pricingPlan) return;

      // SUPERADMIN bypasses limits
      if (user.role === 'SUPERADMIN') return;

      const config = FEATURE_CONFIG[feature];
      const limit = (user.pricingPlan as any)[config.field] as number;

      // 0 or undefined/null means unlimited
      if (!limit) return;

      const periodStart = this.getPeriodStart(config.period);
      const usageCount = await this.prisma.aiUsageLog.count({
        where: {
          userId,
          feature,
          createdAt: { gte: periodStart },
        },
      });

      if (usageCount >= limit) {
        const periodLabel = config.period === 'day' ? 'hari ini' : 'minggu ini';
        throw new ForbiddenException(
          `Batas penggunaan ${config.label} telah tercapai (${limit}x/${periodLabel}). Upgrade paket untuk akses lebih banyak.`,
        );
      }

      // Record usage
      await this.prisma.aiUsageLog.create({
        data: { userId, feature },
      });
    } catch (error) {
      // Let ForbiddenException pass through
      if (error instanceof ForbiddenException) throw error;
      // Any DB error (missing table, connection issue) — log and skip
      this.logger.warn(`checkAndRecord failed for ${feature}: ${(error as Error)?.message}`);
    }
  }

  /**
   * Get remaining usage for a feature
   */
  async getRemaining(userId: string, feature: AiFeature): Promise<{ used: number; limit: number; remaining: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { pricingPlan: true },
    });

    if (!user || !user.pricingPlan) return { used: 0, limit: 0, remaining: 0 };

    const config = FEATURE_CONFIG[feature];
    const limit = (user.pricingPlan as any)[config.field] as number;
    const periodStart = this.getPeriodStart(config.period);

    const used = await this.prisma.aiUsageLog.count({
      where: { userId, feature, createdAt: { gte: periodStart } },
    });

    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  private getPeriodStart(period: 'day' | 'week'): Date {
    const now = new Date();
    if (period === 'day') {
      now.setHours(0, 0, 0, 0);
    } else {
      // Start of week (Monday)
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      now.setDate(now.getDate() + diff);
      now.setHours(0, 0, 0, 0);
    }
    return now;
  }
}
