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

      // 3b. Todo due today
      const todayTodos = await this.prisma.personalTodo.findMany({
        where: {
          status: 'pending',
          dueDate: { gte: today, lt: tomorrow },
        },
        select: { userId: true, title: true },
      });

      const todayTodosByUser: Record<string, string[]> = {};
      for (const t of todayTodos) {
        if (!todayTodosByUser[t.userId]) todayTodosByUser[t.userId] = [];
        todayTodosByUser[t.userId].push(t.title);
      }

      for (const [userId, titles] of Object.entries(todayTodosByUser)) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId },
        });
        if (pref && !pref.deadlineReminder) continue;

        const preview = titles.slice(0, 3).join(', ');
        await this.notificationService.createNotification(
          userId,
          '📋 Todo Hari Ini',
          `${titles.length} todo jatuh tempo hari ini: ${preview}${titles.length > 3 ? '...' : ''}`,
          { category: 'todo', actionUrl: '/todos' },
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
   * Every day at 09:00 — Debt due date reminders
   */
  @Cron('0 9 * * *')
  async sendDebtReminders() {
    this.logger.log('Running debt due date reminders...');
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 86400000);
      const threeDays = new Date(today.getTime() + 3 * 86400000);

      // Debts due today
      const dueToday = await this.prisma.debt.findMany({
        where: { isPaid: false, dueDate: { gte: today, lt: tomorrow } },
        select: { userId: true, description: true, amount: true, personName: true, debtType: true },
      });

      for (const debt of dueToday) {
        const label = debt.debtType === 'owed_by_me'
          ? `Hutang ke ${debt.personName}`
          : `Piutang dari ${debt.personName}`;
        await this.notificationService.createNotification(
          debt.userId,
          '⚠️ Hutang Jatuh Tempo Hari Ini!',
          `${label}: Rp${debt.amount.toLocaleString('id-ID')} — "${debt.description}"`,
          { category: 'keuangan', actionUrl: '/duit-tracker' },
        );
      }

      // Debts due in 3 days (reminder)
      const dueSoon = await this.prisma.debt.findMany({
        where: { isPaid: false, dueDate: { gte: tomorrow, lt: threeDays } },
        select: { userId: true, description: true, amount: true, personName: true, debtType: true, dueDate: true },
      });

      for (const debt of dueSoon) {
        const label = debt.debtType === 'owed_by_me'
          ? `Hutang ke ${debt.personName}`
          : `Piutang dari ${debt.personName}`;
        const daysLeft = Math.ceil((debt.dueDate!.getTime() - today.getTime()) / 86400000);
        await this.notificationService.createNotification(
          debt.userId,
          `📅 Hutang Jatuh Tempo ${daysLeft} Hari Lagi`,
          `${label}: Rp${debt.amount.toLocaleString('id-ID')}`,
          { category: 'keuangan', actionUrl: '/duit-tracker' },
        );
      }

      this.logger.log(`Debt reminders sent: ${dueToday.length} today, ${dueSoon.length} upcoming`);
    } catch (error) {
      this.logger.error('Failed to send debt reminders', error);
    }
  }

  /**
   * Every day at 14:00 — Afternoon briefing reminder
   * Remind users who haven't generated today's briefing yet.
   */
  @Cron('0 14 * * *')
  async sendBriefingReminder() {
    this.logger.log('Running afternoon briefing reminder...');
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        // Check if user already generated briefing today
        const todayBriefing = await this.prisma.dailyBriefing.findUnique({
          where: { userId_date: { userId: user.id, date: today } },
        });
        if (todayBriefing) continue; // already done

        // Don't spam — check if we already sent this reminder today
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: user.id,
            title: { contains: 'Briefing' },
            createdAt: { gte: today },
          },
        });
        if (alreadySent) continue;

        await this.notificationService.createNotification(
          user.id,
          '📋 Jangan lupa Briefing!',
          'Kamu belum buka briefing hari ini. Cek ringkasan keuangan & jadwalmu sekarang!',
          { category: 'keuangan', actionUrl: '/dashboard' },
        );
      }

      this.logger.log('Briefing reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send briefing reminders', error);
    }
  }

  /**
   * Every day at 21:00 — Evening spending summary + spending spike alert
   */
  @Cron('0 21 * * *')
  async sendEveningSpendingSummary() {
    this.logger.log('Running evening spending summary...');
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 86400000);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        const todayTxs = await this.prisma.transaction.findMany({
          where: {
            userId: user.id,
            type: 'expense',
            date: { gte: today, lt: tomorrow },
          },
        });

        if (todayTxs.length === 0) continue;

        const todayTotal = todayTxs.reduce((s, t) => s + t.amount, 0);
        const count = todayTxs.length;

        await this.notificationService.createNotification(
          user.id,
          '🌙 Ringkasan Pengeluaran Hari Ini',
          `Hari ini kamu catat ${count} pengeluaran, total Rp${todayTotal.toLocaleString('id-ID')}. Istirahat yang baik!`,
          { category: 'keuangan', actionUrl: '/duit-tracker' },
        );

        // Spending spike detection: today > 2x daily average this month
        const monthTxs = await this.prisma.transaction.findMany({
          where: {
            userId: user.id,
            type: 'expense',
            date: { gte: monthStart, lt: today },
          },
        });
        const monthTotal = monthTxs.reduce((s, t) => s + t.amount, 0);
        const daysElapsed = Math.max(1, Math.floor((today.getTime() - monthStart.getTime()) / 86400000));
        const dailyAvg = monthTotal / daysElapsed;

        if (dailyAvg > 0 && todayTotal > dailyAvg * 2) {
          await this.notificationService.createNotification(
            user.id,
            '🚨 Pengeluaran Tinggi!',
            `Hari ini kamu habis Rp${todayTotal.toLocaleString('id-ID')}, lebih dari 2x rata-rata harianmu (Rp${Math.round(dailyAvg).toLocaleString('id-ID')}/hari). Ada yang spesial?`,
            { category: 'keuangan', actionUrl: '/duit-tracker' },
          );
        }
      }

      this.logger.log('Evening spending summary sent.');
    } catch (error) {
      this.logger.error('Failed to send evening spending summary', error);
    }
  }

  /**
   * Every day at 12:00 — Midday motivation & meal time reminder
   */
  @Cron('0 12 * * *')
  async sendMiddayNotifications() {
    this.logger.log('Running midday notifications...');
    try {
      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        // Meal time reminder
        await this.notificationService.createNotification(
          user.id,
          '🍽️ Sudah makan siang?',
          'Jangan lupa makan! Cek rekomendasi makan dari AI di menu Makan.',
          { category: 'lifestyle', actionUrl: '/makan' },
        );

        // Streak motivation (only on notable milestones)
        const gamification = await this.prisma.userGamification.findUnique({
          where: { userId: user.id },
        });
        if (!gamification) continue;

        const streak = gamification.currentStreak;
        if (streak >= 3 && (streak % 5 === 0 || streak === 3 || streak === 7 || streak === 14 || streak === 30)) {
          await this.notificationService.createNotification(
            user.id,
            `🔥 ${streak} Hari Streak!`,
            `Keren! Kamu sudah ${streak} hari berturut-turut aktif. Jangan sampai putus ya!`,
            { category: 'gamification', actionUrl: '/dashboard' },
          );
        }
      }

      this.logger.log('Midday notifications sent.');
    } catch (error) {
      this.logger.error('Failed to send midday notifications', error);
    }
  }

  /**
   * Every day at 18:00 — Dinner reminder
   */
  @Cron('0 18 * * *')
  async sendDinnerReminder() {
    this.logger.log('Running dinner reminder...');
    try {
      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        await this.notificationService.createNotification(
          user.id,
          '🍜 Waktunya makan malam!',
          'Sudah sore nih. Bingung makan apa? Minta rekomendasi dari AI!',
          { category: 'lifestyle', actionUrl: '/makan' },
        );
      }
      this.logger.log('Dinner reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send dinner reminders', error);
    }
  }

  /**
   * 1st of every month at 08:00 — Budget reset reminder
   */
  @Cron('0 8 1 * *')
  async sendBudgetResetReminder() {
    this.logger.log('Running budget reset reminder...');
    try {
      const now = new Date();
      const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        // Sum last month's expenses
        const lastMonthStart = new Date(lastMonthYear, lastMonth - 1, 1);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const lastMonthTxs = await this.prisma.transaction.findMany({
          where: {
            userId: user.id,
            type: 'expense',
            date: { gte: lastMonthStart, lt: thisMonthStart },
          },
        });
        const lastMonthTotal = lastMonthTxs.reduce((s, t) => s + t.amount, 0);

        await this.notificationService.createNotification(
          user.id,
          '📆 Bulan Baru, Budget Baru!',
          `Budget bulan ${monthNames[lastMonth]} selesai! Total pengeluaran: Rp${lastMonthTotal.toLocaleString('id-ID')}. Ayo atur budget bulan ini!`,
          { category: 'keuangan', actionUrl: '/duit-tracker?tab=summary' },
        );
      }

      this.logger.log('Budget reset reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send budget reset reminders', error);
    }
  }

  /**
   * Every day at 08:30 — Saving tree deadline approaching (H-3)
   */
  @Cron('30 8 * * *')
  async sendTreeDeadlineReminder() {
    this.logger.log('Running saving tree deadline reminders...');
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDays = new Date(today.getTime() + 3 * 86400000);

      const trees = await this.prisma.savingTree.findMany({
        where: {
          deadline: { gte: today, lte: threeDays },
        },
        select: { userId: true, name: true, currentAmount: true, targetAmount: true, deadline: true },
      });

      for (const tree of trees) {
        if (tree.currentAmount >= tree.targetAmount) continue; // already reached target

        const daysLeft = Math.ceil((tree.deadline!.getTime() - today.getTime()) / 86400000);
        const pct = Math.round((tree.currentAmount / tree.targetAmount) * 100);
        const remaining = tree.targetAmount - tree.currentAmount;

        await this.notificationService.createNotification(
          tree.userId,
          `🌳 Deadline Tabungan ${daysLeft} Hari Lagi`,
          `Pohon "${tree.name}" baru ${pct}% (kurang Rp${remaining.toLocaleString('id-ID')}). Ayo nabung sebelum deadline!`,
          { category: 'keuangan', actionUrl: '/duit-tracker' },
        );
      }

      this.logger.log('Tree deadline reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send tree deadline reminders', error);
    }
  }

  /**
   * Every day at 10:00 — Split bill pending reminder
   */
  @Cron('0 10 * * *')
  async sendSplitBillReminder() {
    this.logger.log('Running split bill reminders...');
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000);

      const pendingBills = await this.prisma.splitBill.findMany({
        where: {
          status: 'settling',
          createdAt: { lt: twoDaysAgo },
        },
        include: {
          participants: { where: { isPaid: false } },
        },
      });

      for (const bill of pendingBills) {
        if (bill.participants.length === 0) continue;

        const unpaidNames = bill.participants.map(p => p.name).slice(0, 3).join(', ');
        const extra = bill.participants.length > 3 ? ` dan ${bill.participants.length - 3} lainnya` : '';

        // Don't spam — max 1 reminder per bill per day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: bill.userId,
            title: { contains: 'Split Bill' },
            message: { contains: bill.eventName || '' },
            createdAt: { gte: today },
          },
        });
        if (alreadySent) continue;

        await this.notificationService.createNotification(
          bill.userId,
          '🧾 Split Bill Belum Lunas',
          `"${bill.eventName || 'Split Bill'}" masih ada ${bill.participants.length} orang belum bayar: ${unpaidNames}${extra}`,
          { category: 'keuangan', actionUrl: '/split-bill' },
        );
      }

      this.logger.log('Split bill reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send split bill reminders', error);
    }
  }

  /**
   * Every day at 08:00 — 7-day inactive warning (more aggressive than 3-day)
   */
  @Cron('0 8 * * *')
  async sendWeekInactiveReminder() {
    this.logger.log('Running 7-day inactive reminder...');
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true, fullName: true },
      });

      for (const user of users) {
        const recentTx = await this.prisma.transaction.findFirst({
          where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
        });
        if (recentTx) continue; // active user

        // Only if we already sent the 3-day reminder (don't skip to 7-day)
        const threeDayNotif = await this.prisma.notification.findFirst({
          where: {
            userId: user.id,
            title: { contains: 'hari gak catat' },
            createdAt: { gte: new Date(Date.now() - 10 * 86400000) },
          },
        });
        if (!threeDayNotif) continue;

        // Don't spam — check if we already sent 7-day reminder recently
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: user.id,
            title: { contains: 'seminggu' },
            createdAt: { gte: sevenDaysAgo },
          },
        });
        if (alreadySent) continue;

        await this.notificationService.createNotification(
          user.id,
          '😴 Sudah seminggu nih!',
          `Halo ${user.fullName?.split(' ')[0] || 'kamu'}! Udah 7 hari gak catat keuangan. 1 menit aja, catat pengeluaran hari ini yuk!`,
          { category: 'keuangan', actionUrl: '/duit-tracker' },
        );
      }

      this.logger.log('7-day inactive reminders sent.');
    } catch (error) {
      this.logger.error('Failed to send 7-day inactive reminders', error);
    }
  }

  /**
   * Sunday at 19:00 — Weekly productivity score
   */
  @Cron('0 19 * * 0')
  async sendWeeklyProductivityScore() {
    this.logger.log('Running weekly productivity score...');
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000);

      const users = await this.prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true },
      });

      for (const user of users) {
        const [totalTodos, completedTodos] = await Promise.all([
          this.prisma.personalTodo.count({
            where: { userId: user.id, createdAt: { gte: weekAgo } },
          }),
          this.prisma.personalTodo.count({
            where: { userId: user.id, completedAt: { gte: weekAgo } },
          }),
        ]);

        if (totalTodos === 0) continue;

        const pct = Math.round((completedTodos / totalTodos) * 100);
        const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '📈';

        await this.notificationService.createNotification(
          user.id,
          `${emoji} Skor Produktivitas Minggu Ini`,
          `Kamu menyelesaikan ${completedTodos}/${totalTodos} todo (${pct}%) minggu ini. ${pct >= 80 ? 'Luar biasa!' : pct >= 50 ? 'Lumayan! Terus semangat!' : 'Minggu depan pasti lebih baik!'}`,
          { category: 'todo', actionUrl: '/todos' },
        );
      }

      this.logger.log('Weekly productivity scores sent.');
    } catch (error) {
      this.logger.error('Failed to send weekly productivity scores', error);
    }
  }

  /**
   * Every day at 07:30 — Deadline H-3 for class tasks
   */
  @Cron('30 7 * * *')
  async sendDeadlineH3() {
    this.logger.log('Running deadline H-3 notifications...');
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
      const fourDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);

      const tasks = await this.prisma.task.findMany({
        where: {
          deadline: { gte: threeDaysFromNow, lt: fourDaysFromNow },
        },
        include: {
          class: { include: { members: { select: { userId: true } } } },
        },
      });

      for (const task of tasks) {
        for (const member of task.class.members) {
          // Check if already submitted
          const submitted = await this.prisma.taskSubmission.findFirst({
            where: { taskId: task.id, userId: member.userId },
          });
          if (submitted) continue; // already submitted, no need to remind

          await this.notificationService.createNotification(
            member.userId,
            '📅 Deadline 3 Hari Lagi',
            `Tugas "${task.title}" deadline dalam 3 hari. Jangan ditunda ya!`,
            { category: 'kelas' },
          );
        }
      }

      this.logger.log('Deadline H-3 notifications sent.');
    } catch (error) {
      this.logger.error('Failed to send deadline H-3', error);
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
        select: { id: true, fullName: true },
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

        // Todo milestone check
        const totalCompleted = await this.prisma.personalTodo.count({
          where: { userId: user.id, completedAt: { not: null } },
        });
        const milestones = [10, 25, 50, 100, 200, 500];
        for (const m of milestones) {
          if (totalCompleted >= m && totalCompleted < m + 7) {
            // Check we haven't sent this milestone before
            const alreadySent = await this.prisma.notification.findFirst({
              where: {
                userId: user.id,
                title: { contains: `${m} Todo` },
              },
            });
            if (!alreadySent) {
              await this.notificationService.createNotification(
                user.id,
                `🎯 ${m} Todo Selesai!`,
                `Luar biasa! Kamu sudah menyelesaikan ${m} todo sejak mulai pakai Synapse. Terus produktif!`,
                { category: 'todo', actionUrl: '/todos' },
              );
            }
            break;
          }
        }
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
