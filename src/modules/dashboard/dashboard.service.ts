import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: User) {
    const now = new Date();
    const hour = now.getHours();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Greeting
    let greeting: string;
    if (hour >= 5 && hour < 11) greeting = `Selamat pagi, ${user.fullName}! ☀️`;
    else if (hour >= 11 && hour < 15) greeting = `Selamat siang, ${user.fullName}! 🌤️`;
    else if (hour >= 15 && hour < 18) greeting = `Selamat sore, ${user.fullName}! 🌅`;
    else greeting = `Selamat malam, ${user.fullName}! 🌙`;

    // Parallel fetch with allSettled for partial failure resilience
    const results = await Promise.allSettled([
      // 0: Month transactions
      this.prisma.transaction.findMany({
        where: { userId: user.id, date: { gte: monthStart } },
      }),
      // 1: Pending todos (today)
      this.prisma.personalTodo.findMany({
        where: { userId: user.id, status: { in: ['pending', 'overdue'] } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // 2: Upcoming task deadlines (class tasks)
      this.prisma.task.findMany({
        where: {
          class: { members: { some: { userId: user.id } } },
          deadline: { gte: now, lte: threeDaysLater },
        },
        include: { class: { select: { name: true } } },
        orderBy: { deadline: 'asc' },
        take: 5,
      }),
      // 3: Classes
      this.prisma.classMember.findMany({
        where: { userId: user.id },
        include: { class: { select: { id: true, name: true, lecturer: true, day: true, room: true, time: true } } },
      }),
      // 4: Budgets this month
      this.prisma.categoryBudget.findMany({
        where: { userId: user.id, month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      // 5: Saving trees
      this.prisma.savingTree.findMany({
        where: { userId: user.id },
        take: 3,
        orderBy: { updatedAt: 'desc' },
      }),
      // 6: Gamification profile
      this.prisma.userGamification.findUnique({
        where: { userId: user.id },
      }),
      // 7: Pending tasks count (not submitted by user)
      this.prisma.task.findMany({
        where: {
          class: { members: { some: { userId: user.id } } },
          deadline: { gte: now },
          submissions: { none: { userId: user.id } },
        },
        select: { id: true },
      }),
      // 8: Unread forum posts
      this.prisma.forumPost.count({
        where: {
          class: { members: { some: { userId: user.id } } },
          createdAt: { gte: weekAgo },
          NOT: { authorId: user.id },
        },
      }),
      // 9: Unanswered Q&A questions
      this.prisma.qnaQuestion.count({
        where: { status: 'open', answers: { none: {} } },
      }),
      // 10: XP transaction history (recent 5)
      this.prisma.xpTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Extract results safely
    const monthTx = results[0].status === 'fulfilled' ? results[0].value : [];
    const pendingTodos = results[1].status === 'fulfilled' ? results[1].value : [];
    const deadlines = results[2].status === 'fulfilled' ? results[2].value : [];
    const classMemberships = results[3].status === 'fulfilled' ? results[3].value : [];
    const budgets = results[4].status === 'fulfilled' ? results[4].value : [];
    const trees = results[5].status === 'fulfilled' ? results[5].value : [];
    const gamification = results[6].status === 'fulfilled' ? results[6].value : null;
    const pendingTasks = results[7].status === 'fulfilled' ? results[7].value : [];
    const unreadForumCount = results[8].status === 'fulfilled' ? results[8].value : 0;
    const unansweredQna = results[9].status === 'fulfilled' ? results[9].value : 0;
    const recentXp = results[10].status === 'fulfilled' ? results[10].value : [];

    // Financial summary
    const income = monthTx.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
    const expense = monthTx.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);

    // Top budget alert
    const byCategory: Record<string, number> = {};
    monthTx.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    });
    let topBudgetAlert: { category: string; percentage: number } | null = null;
    for (const b of budgets) {
      const spent = byCategory[b.category] ?? 0;
      const pct = Math.round((spent / b.amount) * 100);
      if (pct >= 70 && (!topBudgetAlert || pct > topBudgetAlert.percentage)) {
        topBudgetAlert = { category: b.category, percentage: pct };
      }
    }

    // Bawel proactive bubble (rule-based, no AI)
    let bawelBubble: string | null = null;
    const todayCoffee = monthTx.filter((t: any) => t.type === 'expense' && t.date >= todayStart && ['minuman', 'minuman & kafe'].includes(t.category.toLowerCase()));
    if (todayCoffee.length >= 3) {
      const coffeeTotal = monthTx.filter((t: any) => t.type === 'expense' && ['minuman', 'minuman & kafe'].includes(t.category.toLowerCase())).reduce((s: number, t: any) => s + t.amount, 0);
      bawelBubble = `Kopi ke-${todayCoffee.length} hari ini. Total udah Rp${coffeeTotal.toLocaleString('id-ID')} buat minuman bulan ini ☕`;
    } else if (topBudgetAlert && topBudgetAlert.percentage > 100) {
      bawelBubble = `Budget ${topBudgetAlert.category} jebol! Over ${topBudgetAlert.percentage - 100}%. Besok masak sendiri ya 😤`;
    } else if (topBudgetAlert && topBudgetAlert.percentage >= 80) {
      bawelBubble = `Budget ${topBudgetAlert.category} tinggal ${100 - topBudgetAlert.percentage}%. Pelan-pelan ya!`;
    }

    // AI one-liner
    const parts: string[] = [];
    if (deadlines.length > 0) parts.push(`${deadlines.length} deadline mendekat`);
    if (topBudgetAlert) parts.push(`budget ${topBudgetAlert.category} ${topBudgetAlert.percentage}%`);
    const doneTodos = pendingTodos.filter((t: any) => t.status === 'done').length;
    if (pendingTodos.length > 0) parts.push(`${pendingTodos.length} todo pending`);
    const aiOneLiner = parts.length > 0 ? parts.join(', ') : 'Hari ini terlihat tenang. Nikmati! 🌿';

    // Todo stats
    const todosDone = pendingTodos.filter((t: any) => t.status === 'done').length;
    const todosTotal = pendingTodos.length;

    // Budget Challenge (rule-based: target = 80% of highest spending category last week)
    let weeklyChallenge: { title: string; category: string; current: number; target: number; daysLeft: number } | null = null;
    const lastWeekTxs = monthTx.filter((t: any) => t.type === 'expense' && new Date(t.date) >= weekAgo);
    if (lastWeekTxs.length > 0) {
      const catSpend: Record<string, number> = {};
      lastWeekTxs.forEach((t: any) => { catSpend[t.category] = (catSpend[t.category] ?? 0) + t.amount; });
      const topCat = Object.entries(catSpend).sort((a, b) => b[1] - a[1])[0];
      if (topCat && topCat[1] > 0) {
        const target = Math.round(topCat[1] * 0.8);
        // Current week spending in same category
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1); // Monday
        thisWeekStart.setHours(0, 0, 0, 0);
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
        const thisWeekSpend = monthTx
          .filter((t: any) => t.type === 'expense' && t.category === topCat[0] && new Date(t.date) >= thisWeekStart)
          .reduce((s: number, t: any) => s + t.amount, 0);
        const daysLeft = Math.max(0, Math.ceil((thisWeekEnd.getTime() - now.getTime()) / 86400000));
        weeklyChallenge = {
          title: `${topCat[0].charAt(0).toUpperCase() + topCat[0].slice(1)} di bawah ${Math.round(target / 1000) > 0 ? `Rp${Math.round(target / 1000)}K` : `Rp${target}`}`,
          category: topCat[0],
          current: Math.round(thisWeekSpend),
          target,
          daysLeft,
        };
      }
    }

    // Level info for gamification
    const LEVELS = [
      { level: 1, name: 'Mahasiswa Baru', minXp: 0 },
      { level: 2, name: 'Mulai Rajin', minXp: 100 },
      { level: 3, name: 'Konsisten', minXp: 300 },
      { level: 4, name: 'Produktif', minXp: 600 },
      { level: 5, name: 'Overachiever', minXp: 1000 },
      { level: 6, name: 'Synapse Pro', minXp: 1500 },
      { level: 7, name: 'Legenda Kampus', minXp: 2500 },
    ];
    const currentLevelInfo = gamification ? LEVELS.find(l => l.level === gamification.level) || LEVELS[0] : LEVELS[0];
    const nextLevelInfo = gamification ? LEVELS.find(l => l.level === (gamification.level || 1) + 1) : LEVELS[1];

    // Today's schedule
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayDayName = dayNames[now.getDay()];
    const todaySchedule = classMemberships
      .filter((cm: any) => cm.class.day && cm.class.day.toLowerCase() === todayDayName.toLowerCase())
      .map((cm: any) => ({ className: cm.class.name, day: cm.class.day, time: cm.class.time || '-', room: cm.class.room || '-' }));

    return {
      greeting,
      aiOneLiner,
      deadlines: deadlines.map((d: any) => ({
        id: d.id,
        title: d.title,
        className: d.class?.name,
        classId: d.classId,
        deadline: d.deadline,
      })),
      financeSummary: { income, expense, balance: income - expense },
      topBudgetAlert,
      bawelBubble,
      todosToday: pendingTodos.map((t: any) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        priority: t.priority,
        status: t.status,
      })),
      todoStats: { total: todosTotal, done: todosDone },
      classes: classMemberships.map((cm: any) => ({
        id: cm.class.id,
        name: cm.class.name,
        lecturer: cm.class.lecturer,
        day: cm.class.day,
        time: cm.class.time,
        room: cm.class.room,
        role: cm.role,
      })),
      trees: trees.map((t: any) => ({
        id: t.id,
        name: t.name,
        currentAmount: t.currentAmount,
        targetAmount: t.targetAmount,
        progress: t.targetAmount > 0 ? Math.round((t.currentAmount / t.targetAmount) * 100) : 0,
      })),
      streakDays: gamification?.currentStreak ?? 0,
      academicSummary: {
        activeClasses: classMemberships.length,
        pendingTasks: pendingTasks.length,
        unreadForumMessages: unreadForumCount,
        unansweredQna,
        todaySchedule,
      },
      gamification: gamification ? {
        level: gamification.level,
        levelTitle: currentLevelInfo.name,
        currentXp: gamification.totalXp,
        nextLevelXp: nextLevelInfo?.minXp ?? null,
        totalAchievements: gamification.achievements?.length ?? 0,
        recentAchievement: null,
        currentStreak: gamification.currentStreak,
        longestStreak: gamification.longestStreak,
        weeklyChallenge,
      } : null,
    };
  }
}
