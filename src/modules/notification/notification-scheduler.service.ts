import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Every day at 07:00 — Morning notifications
   * - Morning briefing (yesterday's spending summary)
   * - Deadline H-0 and H-1
   * - Todo overdue
   * - Idle user reminder (3+ days)
   */
  @Cron('0 7 * * *')
  async sendMorningNotifications() {
    this.logger.log('Running morning notifications...');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    const dayAfterTomorrow = new Date(today.getTime() + 2 * 86400000);

    try {
      // 0. Morning briefing — "Briefing siap! Kemarin kamu habis Rp {yesterday_total}"
      const yesterday = new Date(today.getTime() - 86400000);
      const briefingUsers = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of briefingUsers) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId: user.id },
        });
        if (pref && !pref.deadlineReminder && !pref.budgetAlert) continue;

        const yesterdayTxs = await this.prisma.transaction.findMany({
          where: {
            userId: user.id,
            type: 'expense',
            date: { gte: yesterday, lt: today },
          },
        });

        const yesterdayTotal = yesterdayTxs.reduce((s, t) => s + t.amount, 0);
        if (yesterdayTotal > 0) {
          await this.notificationService.createNotification(
            user.id,
            '📋 Briefing siap!',
            `Briefing siap! Kemarin kamu habis Rp ${yesterdayTotal.toLocaleString('id-ID')}`,
            { category: 'keuangan', actionUrl: '/dashboard' },
          );
        }
      }

      // 1. Deadline H-0 (today)
      const todayDeadlines = await this.prisma.task.findMany({
        where: {
          deadline: { gte: today, lt: tomorrow },
        },
        include: {
          class: {
            include: { members: { select: { userId: true } } },
          },
        },
      });

      for (const task of todayDeadlines) {
        for (const member of task.class.members) {
          // Check preferences
          const pref = await this.prisma.notificationPreference.findUnique({
            where: { userId: member.userId },
          });
          if (pref && !pref.deadlineReminder) continue;

          await this.notificationService.createNotification(
            member.userId,
            '⚠️ Deadline Hari Ini!',
            `Tugas "${task.title}" deadline hari ini${task.deadline ? ` jam ${new Date(task.deadline).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}!`,
            { category: 'kelas' },
          );
        }
      }

      // 2. Deadline H-1 (tomorrow)
      const tomorrowDeadlines = await this.prisma.task.findMany({
        where: {
          deadline: { gte: tomorrow, lt: dayAfterTomorrow },
        },
        include: {
          class: {
            include: { members: { select: { userId: true } } },
          },
        },
      });

      for (const task of tomorrowDeadlines) {
        for (const member of task.class.members) {
          const pref = await this.prisma.notificationPreference.findUnique({
            where: { userId: member.userId },
          });
          if (pref && !pref.deadlineReminder) continue;

          await this.notificationService.createNotification(
            member.userId,
            '📅 Deadline Besok',
            `Tugas "${task.title}" deadline besok. Udah mulai?`,
            { category: 'kelas' },
          );
        }
      }

      // 3. Todo overdue
      const overdueTodos = await this.prisma.personalTodo.findMany({
        where: {
          status: 'pending',
          dueDate: { lt: today },
        },
        select: { userId: true, id: true },
      });

      // Group by user
      const todosByUser: Record<string, number> = {};
      for (const t of overdueTodos) {
        todosByUser[t.userId] = (todosByUser[t.userId] ?? 0) + 1;
      }

      for (const [userId, count] of Object.entries(todosByUser)) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId },
        });
        if (pref && !pref.deadlineReminder) continue;

        await this.notificationService.createNotification(
          userId,
          '⏰ Todo Terlambat',
          `${count} todo sudah lewat deadline. Mau reschedule?`,
          { category: 'todo' },
        );
      }

      // 4. Idle user reminder (3+ days without transaction)
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
      const allUsers = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of allUsers) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId: user.id },
        });
        if (pref && !pref.idleReminder) continue;

        const recentTx = await this.prisma.transaction.findFirst({
          where: { userId: user.id, createdAt: { gte: threeDaysAgo } },
        });

        if (!recentTx) {
          // Check we haven't sent this reminder recently
          const recentNotif = await this.prisma.notification.findFirst({
            where: {
              userId: user.id,
              title: { contains: 'hari gak catat' },
              createdAt: { gte: threeDaysAgo },
            },
          });
          if (recentNotif) continue;

          await this.notificationService.createNotification(
            user.id,
            '🤨 3 hari gak catat',
            '3 hari gak catat pengeluaran. Gak mungkin gak keluar duit kan?',
            { category: 'keuangan' },
          );
        }
      }

      this.logger.log('Morning notifications completed.');
    } catch (error) {
      this.logger.error('Failed to send morning notifications', error);
    }
  }

  /**
   * Sunday at 20:00 — Weekly recap notification
   */
  @Cron('0 20 * * 0')
  async sendWeeklyRecap() {
    this.logger.log('Sending weekly recap notifications...');
    try {
      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId: user.id },
        });
        if (pref && !pref.weeklyRecap) continue;

        const weekAgo = new Date(Date.now() - 7 * 86400000);
        const weekTxs = await this.prisma.transaction.findMany({
          where: { userId: user.id, date: { gte: weekAgo } },
        });

        const expense = weekTxs
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0);
        const income = weekTxs
          .filter((t) => t.type === 'income')
          .reduce((s, t) => s + t.amount, 0);

        const gamification = await this.prisma.userGamification.findUnique({
          where: { userId: user.id },
        });

        const streak = gamification?.currentStreak ?? 0;

        await this.notificationService.createNotification(
          user.id,
          '📊 Rekap Minggu Ini',
          `Minggu ini: Rp${expense.toLocaleString('id-ID')} keluar, Rp${income.toLocaleString('id-ID')} masuk.${streak > 0 ? ` 🔥 ${streak} hari streak!` : ''} Lihat detail di Dashboard.`,
          { category: 'keuangan', actionUrl: '/dashboard' },
        );
      }

      this.logger.log('Weekly recap sent.');
    } catch (error) {
      this.logger.error('Failed to send weekly recap', error);
    }
  }

  /**
   * Every 15 minutes — Deliver queued notifications after quiet hours end.
   * Checks all users who have quiet hours configured and delivers
   * any pending notifications once their quiet window has passed.
   */
  @Cron('*/15 * * * *')
  async deliverAfterQuietHours() {
    try {
      // Find users with quiet hours configured
      const usersWithQuietHours = await this.prisma.notificationPreference.findMany({
        where: {
          quietHoursStart: { not: null },
          quietHoursEnd: { not: null },
        },
        select: { userId: true },
      });

      for (const { userId } of usersWithQuietHours) {
        await this.notificationService.deliverQueuedNotifications(userId);
      }
    } catch (error) {
      this.logger.error('Failed to deliver queued notifications', error);
    }
  }
}
