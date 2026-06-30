import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { AuthGuard } from '../../common/guards/auth.guard';

const GRACE_PERIOD_DAYS = 30;

/**
 * Cron service that:
 * 1. Downgrades expired paid plans back to the lowest-price plan (daily at 00:05)
 * 2. Purges premium feature data after 30-day grace period (daily at 01:00)
 */
@Injectable()
export class PlanExpiryService {
  private readonly logger = new Logger(PlanExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authGuard: AuthGuard,
  ) {}

  /** Get the free/lowest-price plan name dynamically */
  private async getFreePlanName(): Promise<string> {
    const lowestPlan = await this.prisma.pricingPlan.findFirst({
      where: { price: 0 },
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    });
    return lowestPlan?.name ?? (await this.prisma.pricingPlan.findFirst({
      orderBy: { price: 'asc' },
      select: { name: true },
    }))?.name ?? 'NEWBIE';
  }

  @Cron('5 0 * * *') // Every day at 00:05
  async handleExpiredPlans() {
    this.logger.log('Checking for expired plans...');

    const now = new Date();
    const freePlanName = await this.getFreePlanName();

    // Find all users whose plan has expired (planExpiresAt <= now)
    const expiredUsers = await this.prisma.user.findMany({
      where: {
        planExpiresAt: { not: null, lte: now },
      },
      select: { id: true, plan: true, fullName: true, planExpiresAt: true },
    });

    if (expiredUsers.length === 0) {
      this.logger.log('No expired plans found.');
      return;
    }

    this.logger.log(`Found ${expiredUsers.length} expired plan(s). Downgrading...`);

    for (const user of expiredUsers) {
      try {
        // Set grace period: 30 days from now to retain data
        const dataRetentionDeadline = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        await this.prisma.user.update({
          where: { id: user.id },
          data: { plan: freePlanName, planExpiresAt: null, dataRetentionDeadline },
        });

        // Notify the user
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            title: '⏰ Langganan Berakhir',
            message: `Plan ${user.plan} kamu telah berakhir. Data fitur premium masih tersimpan selama 30 hari. Upgrade kembali sebelum ${dataRetentionDeadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} agar tidak hilang!`,
          },
        });

        // Invalidate auth cache
        this.authGuard.invalidateUser(user.id);

        this.logger.log(`User ${user.id} (${user.fullName}) downgraded from ${user.plan} to ${freePlanName}. Data retention until ${dataRetentionDeadline.toISOString()}`);
      } catch (error) {
        this.logger.error(`Failed to downgrade user ${user.id}:`, error);
      }
    }

    this.logger.log(`Plan expiry check complete. ${expiredUsers.length} user(s) downgraded.`);
  }

  @Cron('0 1 * * *') // Every day at 01:00
  async handleDataRetentionPurge() {
    this.logger.log('Checking for users past data retention deadline...');

    const now = new Date();

    // Find users whose grace period has ended (dataRetentionDeadline passed)
    const usersToePurge = await this.prisma.user.findMany({
      where: {
        dataRetentionDeadline: { not: null, lte: now },
      },
      select: { id: true, fullName: true, dataRetentionDeadline: true },
    });

    if (usersToePurge.length === 0) {
      this.logger.log('No users past data retention deadline.');
      return;
    }

    this.logger.log(`Found ${usersToePurge.length} user(s) past retention deadline. Purging premium data...`);

    for (const user of usersToePurge) {
      try {
        await this.purgePremiumData(user.id);

        // Clear the deadline
        await this.prisma.user.update({
          where: { id: user.id },
          data: { dataRetentionDeadline: null },
        });

        // Notify user
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            title: '🗑️ Data Fitur Premium Dihapus',
            message: 'Masa retensi data 30 hari telah berakhir. Data fitur premium (AI insight, briefing, food history, exam prediction, dll) telah dihapus. Data dasar seperti akun, kelas, dan forum tetap aman.',
          },
        });

        this.logger.log(`Purged premium data for user ${user.id} (${user.fullName})`);
      } catch (error) {
        this.logger.error(`Failed to purge data for user ${user.id}:`, error);
      }
    }

    this.logger.log(`Data purge complete. ${usersToePurge.length} user(s) purged.`);
  }

  /**
   * Purge premium-only feature data for a user.
   * Keeps: account, classes, forum posts, basic todos, basic transactions.
   * Deletes: AI briefings, food history, receipt scans, exam predictions, skripsweet data, etc.
   */
  private async purgePremiumData(userId: string) {
    await this.prisma.$transaction([
      // AI Briefings
      this.prisma.dailyBriefing.deleteMany({ where: { userId } }),
      // Food recommendation history & ratings
      this.prisma.foodRecommendationHistory.deleteMany({ where: { userId } }),
      this.prisma.foodRating.deleteMany({ where: { userId } }),
      this.prisma.foodFavorite.deleteMany({ where: { userId } }),
      // Receipt scans
      this.prisma.receiptScan.deleteMany({ where: { userId } }),
      // XP / gamification transactions (keep base gamification record)
      this.prisma.xpTransaction.deleteMany({ where: { userId } }),
    ]);
  }
}
