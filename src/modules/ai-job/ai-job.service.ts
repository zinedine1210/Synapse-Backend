import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/notification.service';

/** Stale threshold: jobs PROCESSING for longer than this are considered stuck */
const STALE_MS = 5 * 60 * 1000; // 5 minutes

/** Human-readable labels for AI job types */
const JOB_LABELS: Record<string, { title: string; url: string }> = {
  weekly_roast: { title: 'Weekly Roast siap! 🔥', url: '/duit-tracker' },
  scan_receipt: { title: 'Scan struk selesai! 📸', url: '/duit-tracker' },
  ai_briefing: { title: 'AI Briefing siap! 📋', url: '/dashboard' },
  ai_insight: { title: 'AI Insight siap! 💡', url: '/insight' },
  food_from_fridge: { title: 'Rekomendasi makanan siap! 🍳', url: '/makan' },
  food_from_menu: { title: 'Analisis menu selesai! 🍽️', url: '/makan' },
  split_bill_scan: { title: 'Split bill selesai di-scan! 💰', url: '/split-bill' },
  exam_prediction: { title: 'Prediksi ujian siap! 📝', url: '/class' },
  generate_quiz: { title: 'Kuis AI berhasil dibuat! 🎯', url: '/quiz' },
  briefing_refresh: { title: 'Briefing diperbarui! 📋', url: '/dashboard' },
};

@Injectable()
export class AiJobService {
  private readonly logger = new Logger(AiJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Wrap an AI call with job tracking.
   * - Prevents duplicate concurrent requests (same user + jobType)
   * - Persists result to DB so frontend can poll for it after a page refresh
   */
  async run<T>(userId: string, jobType: string, fn: () => Promise<T>): Promise<T> {
    const staleThreshold = new Date(Date.now() - STALE_MS);

    let job: { id: string } | null = null;
    try {
      // Atomic: check for existing PROCESSING + clean stale in one transaction
      job = await this.prisma.$transaction(async (tx) => {
        // Clean stale PROCESSING jobs
        await tx.aiJob.updateMany({
          where: {
            userId,
            jobType,
            status: 'PROCESSING',
            createdAt: { lt: staleThreshold },
          },
          data: { status: 'FAILED', error: 'Request timeout', completedAt: new Date() },
        });

        // Check for active PROCESSING job
        const existing = await tx.aiJob.findFirst({
          where: { userId, jobType, status: 'PROCESSING' },
        });
        if (existing) {
          throw new ConflictException(
            'AI sedang memproses request sebelumnya. Tunggu sampai selesai ya.',
          );
        }

        // Create new PROCESSING job
        return tx.aiJob.create({
          data: { userId, jobType, status: 'PROCESSING' },
        });
      });
    } catch (error: any) {
      // Let ConflictException pass through (already processing)
      if (error instanceof ConflictException) throw error;
      // DB/table error — skip job tracking, run directly
      this.logger.warn(`AiJob tracking unavailable (${jobType}): ${error?.message}`);
      return fn();
    }

    // Run the AI function outside the transaction
    try {
      const result = await fn();
      await this.prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: JSON.stringify(result),
          completedAt: new Date(),
        },
      }).catch((e: any) => this.logger.warn('Failed to update AiJob to COMPLETED', e));
      return result;
    } catch (error: any) {
      // Update job to FAILED — don't let this mask the original error
      await this.prisma.aiJob
        .update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: error.message || 'Unknown error',
            completedAt: new Date(),
          },
        })
        .catch((e: any) => this.logger.warn('Failed to update AiJob status', e));
      throw error;
    }
  }

  /**
   * Start an AI job asynchronously — returns immediately with status.
   * The AI function runs in the background and updates the job when done.
   * Frontend polls GET /ai-jobs/status?type=xxx to get the result.
   */
  async runAsync<T>(userId: string, jobType: string, fn: () => Promise<T>): Promise<{ status: string; message: string }> {
    const staleThreshold = new Date(Date.now() - STALE_MS);

    let job: { id: string; existing: boolean };
    try {
      job = await this.prisma.$transaction(async (tx) => {
        // Clean stale PROCESSING jobs
        await tx.aiJob.updateMany({
          where: { userId, jobType, status: 'PROCESSING', createdAt: { lt: staleThreshold } },
          data: { status: 'FAILED', error: 'Request timeout', completedAt: new Date() },
        });

        // Check for active PROCESSING job
        const existing = await tx.aiJob.findFirst({
          where: { userId, jobType, status: 'PROCESSING' },
        });
        if (existing) {
          return { id: existing.id, existing: true };
        }

        // Create new PROCESSING job
        const created = await tx.aiJob.create({
          data: { userId, jobType, status: 'PROCESSING' },
        });
        return { id: created.id, existing: false };
      });
    } catch (error: any) {
      // DB/table error — run synchronously as fallback
      this.logger.warn(`AiJob async tracking unavailable (${jobType}): ${error?.message}`);
      const result = await fn();
      return { status: 'COMPLETED', message: JSON.stringify(result) };
    }

    if (job.existing) {
      return { status: 'PROCESSING', message: 'Sedang diproses. Tunggu ya~' };
    }

    // Fire-and-forget: run in background
    (async () => {
      try {
        const result = await fn();
        await this.prisma.aiJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', result: JSON.stringify(result), completedAt: new Date() },
        });
        // Send push notification on completion
        this.sendJobNotification(userId, jobType, true).catch(() => {});
      } catch (error: any) {
        await this.prisma.aiJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: error?.message || 'Unknown error', completedAt: new Date() },
        }).catch((e: any) => this.logger.warn(`Failed to mark job FAILED: ${e?.message}`));
        // Send failure notification
        this.sendJobNotification(userId, jobType, false).catch(() => {});
      }
    })();

    return { status: 'PROCESSING', message: 'Sedang diproses oleh AI...' };
  }

  /**
   * Get the latest job status for a user + jobType.
   * Returns PROCESSING job if one exists, otherwise the latest COMPLETED/FAILED.
   */
  async getStatus(userId: string, jobType: string) {
    try {
      const staleThreshold = new Date(Date.now() - STALE_MS);

      // Check for active PROCESSING job (non-stale)
      const processing = await this.prisma.aiJob.findFirst({
        where: { userId, jobType, status: 'PROCESSING', createdAt: { gte: staleThreshold } },
        orderBy: { createdAt: 'desc' },
      });
      if (processing) return this.formatJob(processing);

      // Get latest COMPLETED/FAILED job (exclude DISMISSED and stale PROCESSING)
      const job = await this.prisma.aiJob.findFirst({
        where: { userId, jobType, status: { in: ['COMPLETED', 'FAILED'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!job) return null;
      return this.formatJob(job);
    } catch (error: any) {
      this.logger.error(`getStatus failed for jobType=${jobType}: ${error?.message}`, error?.stack);
      // Return null instead of throwing to prevent 500 on status checks
      return null;
    }
  }

  /** Dismiss a job so it no longer shows up in status checks */
  async dismiss(userId: string, jobId: string) {
    await this.prisma.aiJob.updateMany({
      where: { id: jobId, userId },
      data: { status: 'DISMISSED' },
    });
    return { success: true };
  }

  private formatJob(job: any) {
    let parsedResult = null;
    if (job.result) {
      try {
        parsedResult = JSON.parse(job.result);
      } catch {
        parsedResult = job.result;
      }
    }
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      result: parsedResult,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }

  /** Send notification when AI job completes or fails */
  private async sendJobNotification(userId: string, jobType: string, success: boolean) {
    try {
      const label = JOB_LABELS[jobType];
      if (!label) return; // unknown job type, skip

      if (success) {
        await this.notificationService.createNotification(
          userId,
          `🤖 ${label.title}`,
          `AI selesai memproses. Lihat hasilnya sekarang!`,
          { category: 'ai', actionUrl: label.url },
        );
      } else {
        await this.notificationService.createNotification(
          userId,
          '⚠️ AI Gagal Memproses',
          `Proses ${label.title.replace(/!|siap|selesai/g, '').trim()} gagal. Coba lagi nanti.`,
          { category: 'ai', actionUrl: label.url },
        );
      }
    } catch (err: any) {
      this.logger.debug(`sendJobNotification skipped: ${err?.message}`);
    }
  }
}
