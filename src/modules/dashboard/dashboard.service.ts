import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
  ) {}

  /**
   * GET /dashboard/summary-v2
   * Enhanced summary including weeklyChallenge (from WeeklyChallenge + Progress),
   * classSummary, and class comparison indicator.
   */
  async getSummaryV2(user: User) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const results = await Promise.allSettled([
      // 0: Active weekly challenge for this user
      this.getWeeklyChallengeForUser(user.id),
      // 1: Class summary (all user's classes with member counts)
      this.prisma.classMember.findMany({
        where: { userId: user.id },
        include: {
          class: {
            select: { id: true, name: true, _count: { select: { members: true } } },
          },
        },
      }),
      // 2: This month's finance — use groupBy aggregate instead of loading all rows
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { userId: user.id, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      // 3: Gamification profile
      this.prisma.userGamification.findUnique({ where: { userId: user.id } }),
    ]);

    const weeklyChallenge = results[0].status === 'fulfilled' ? results[0].value : null;
    const classMemberships = results[1].status === 'fulfilled' ? results[1].value : [];
    const financeSums = results[2].status === 'fulfilled' ? results[2].value : [];
    const gamification = results[3].status === 'fulfilled' ? results[3].value : null;

    // Class summary
    const classSummary = classMemberships.map((cm: any) => ({
      classId: cm.class.id,
      className: cm.class.name,
      memberCount: cm.class._count.members,
      role: cm.role,
    }));

    // Financial summary from aggregate
    const income = (financeSums as any[]).find((g: any) => g.type === 'income')?._sum?.amount || 0;
    const expense = (financeSums as any[]).find((g: any) => g.type === 'expense')?._sum?.amount || 0;

    // Class comparison indicator (whether user has classes with >= 5 members)
    const classesWithEnoughMembers = classSummary.filter((c: any) => c.memberCount >= 5);
    const comparisonAvailable = classesWithEnoughMembers.length > 0;

    return {
      weeklyChallenge,
      classSummary,
      financeSummary: { income, expense, balance: income - expense },
      gamification: gamification
        ? { totalXp: gamification.totalXp, level: gamification.level, currentStreak: gamification.currentStreak }
        : null,
      comparisonAvailable,
    };
  }

  /**
   * GET /dashboard/class-comparison
   * Anonymous class spending average. Only returns data if >= 5 members have transaction data.
   */
  async getClassComparison(user: User) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all classes the user belongs to
    const memberships = await this.prisma.classMember.findMany({
      where: { userId: user.id },
      select: { classId: true, class: { select: { name: true } } },
    });

    const comparisons: Array<{
      classId: string;
      className: string;
      averageSpending: number;
      minSpending: number;
      maxSpending: number;
      memberCount: number;
      userSpending: number;
    }> = [];

    for (const membership of memberships) {
      // Get all members in this class
      const classMembers = await this.prisma.classMember.findMany({
        where: { classId: membership.classId },
        select: { userId: true },
      });

      const memberUserIds = classMembers.map((m) => m.userId);

      // Get spending for each member this month
      const memberSpending = await this.prisma.transaction.groupBy({
        by: ['userId'],
        where: {
          userId: { in: memberUserIds },
          type: 'expense',
          date: { gte: monthStart },
        },
        _sum: { amount: true },
      });

      // Only show comparison if at least 5 members have spending data
      if (memberSpending.length < 5) continue;

      const amounts = memberSpending.map((m) => m._sum.amount || 0);
      const total = amounts.reduce((s, a) => s + a, 0);
      const average = Math.round(total / amounts.length);
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);

      // User's own spending
      const userEntry = memberSpending.find((m) => m.userId === user.id);
      const userSpending = userEntry?._sum.amount || 0;

      comparisons.push({
        classId: membership.classId,
        className: membership.class.name,
        averageSpending: average,
        minSpending: min,
        maxSpending: max,
        memberCount: memberSpending.length,
        userSpending,
      });
    }

    return { comparisons };
  }

  /**
   * GET /dashboard/trending-qna
   * Top 3 trending questions (7-day window), reuses QnA trending logic.
   */
  async getTrendingQna() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find questions whose answers received the most upvotes in the past 7 days
    const trendingData = await this.prisma.qnaVote.groupBy({
      by: ['answerId'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _sum: { value: true },
      orderBy: { _sum: { value: 'desc' } },
    });

    if (trendingData.length === 0) {
      // Fallback: return most viewed questions (limit 3)
      return this.prisma.qnaQuestion.findMany({
        where: { isPublic: true },
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          viewCount: true,
          createdAt: true,
          _count: { select: { answers: true } },
        },
        orderBy: { viewCount: 'desc' },
        take: 3,
      });
    }

    // Map answer -> question
    const answerIds = trendingData.map((d) => d.answerId);
    const answers = await this.prisma.qnaAnswer.findMany({
      where: { id: { in: answerIds } },
      select: { id: true, questionId: true },
    });

    const questionScores = new Map<string, number>();
    for (const entry of trendingData) {
      const answer = answers.find((a) => a.id === entry.answerId);
      if (answer) {
        const current = questionScores.get(answer.questionId) || 0;
        questionScores.set(answer.questionId, current + (entry._sum.value || 0));
      }
    }

    const sortedQuestionIds = [...questionScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    if (sortedQuestionIds.length === 0) return [];

    const questions = await this.prisma.qnaQuestion.findMany({
      where: { id: { in: sortedQuestionIds }, isPublic: true },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { answers: true } },
      },
    });

    // Return in ranked order with trending score
    return sortedQuestionIds
      .map((id) => {
        const q = questions.find((question) => question.id === id);
        if (!q) return null;
        return { ...q, trendingScore: questionScores.get(id) || 0 };
      })
      .filter(Boolean);
  }

  /**
   * GET /dashboard/todays-briefing
   * Aggregates: today's schedule, pending deadlines, yesterday's spending, today's pending todos.
   */
  async getTodaysBriefing(user: User) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayDayName = dayNames[now.getDay()];

    const results = await Promise.allSettled([
      // 0: Today's class sessions via user's ClassMember
      this.prisma.classMember.findMany({
        where: { userId: user.id },
        include: {
          class: {
            select: { id: true, name: true, day: true, time: true, room: true, lecturer: true },
          },
        },
      }),
      // 1: Pending deadlines (Task model due today/tomorrow)
      this.prisma.task.findMany({
        where: {
          class: { members: { some: { userId: user.id } } },
          deadline: { gte: todayStart, lt: tomorrowEnd },
          submissions: { none: { userId: user.id } },
        },
        include: { class: { select: { name: true } } },
        orderBy: { deadline: 'asc' },
        take: 10,
      }),
      // 2: Yesterday's spending aggregate (Transaction)
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: {
          userId: user.id,
          type: 'expense',
          date: { gte: yesterdayStart, lt: todayStart },
        },
        _sum: { amount: true },
      }),
      // 3: Today's pending todos (PersonalTodo)
      this.prisma.personalTodo.findMany({
        where: {
          userId: user.id,
          status: { in: ['pending', 'overdue'] },
          OR: [
            { dueDate: { gte: todayStart, lt: tomorrowStart } },
            { dueDate: null },
          ],
        },
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }],
        take: 10,
      }),
    ]);

    const classMemberships = results[0].status === 'fulfilled' ? results[0].value : [];
    const deadlines = results[1].status === 'fulfilled' ? results[1].value : [];
    const yesterdayGroups = results[2].status === 'fulfilled' ? results[2].value : [];
    const todayTodos = results[3].status === 'fulfilled' ? results[3].value : [];

    // Filter classes for today's schedule
    const schedule = classMemberships
      .filter((cm: any) => cm.class.day && cm.class.day.toLowerCase() === todayDayName.toLowerCase())
      .map((cm: any) => ({
        classId: cm.class.id,
        className: cm.class.name,
        time: cm.class.time || '-',
        room: cm.class.room || '-',
        lecturer: cm.class.lecturer || '-',
      }));

    // Yesterday's spending summary from aggregates
    const yesterdayByCategory: Record<string, number> = {};
    let yesterdayTotal = 0;
    (yesterdayGroups as any[]).forEach((g: any) => {
      const amt = g._sum.amount || 0;
      yesterdayByCategory[g.category] = amt;
      yesterdayTotal += amt;
    });

    // Today's todos
    const todos = todayTodos.map((t: any) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      priority: t.priority,
      status: t.status,
    }));

    return {
      schedule,
      deadlines: deadlines.map((d: any) => ({
        id: d.id,
        title: d.title,
        className: d.class?.name,
        deadline: d.deadline,
      })),
      spending: {
        yesterdayTotal,
        yesterdayByCategory,
        transactionCount: (yesterdayGroups as any[]).length,
      },
      todos,
    };
  }

  /**
   * GET /dashboard/ai-briefing
   * Gathers ALL relevant context for the authenticated user and feeds it to Google
   * Gemini to produce a personalized, conversational daily briefing ("Si Bawel").
   *
   * The endpoint is resilient: if the AI call or JSON parsing fails, it falls back to
   * a rule-based briefing built from the same gathered data, so it NEVER throws a 500.
   */
  async getAiBriefing(user: User) {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const existing = await this.prisma.dailyBriefing.findUnique({
        where: {
          userId_date: {
            userId: user.id,
            date: todayStart,
          },
        },
      });

      if (!existing) {
        return { exists: false };
      }

      try {
        return JSON.parse(existing.content);
      } catch {
        return { exists: false };
      }
    } catch (error) {
      // If DB query fails (e.g. connection issue), return graceful fallback
      return { exists: false };
    }
  }

  async generateAiBriefing(user: User) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get user's plan limit for briefing
    const userWithPlan = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { pricingPlan: true },
    });
    const briefingLimit = userWithPlan?.pricingPlan?.aiBriefingLimit ?? 2;

    const existing = await this.prisma.dailyBriefing.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: todayStart,
        },
      },
    });

    let hitCount = 0;
    if (existing) {
      try {
        const parsedContent = JSON.parse(existing.content);
        hitCount = parsedContent.hitCount ?? 0;
      } catch (e) {
        // Reset count if corrupted
      }
    }

    // Skip limit check for SUPERADMIN; use plan-based limit for others
    if (user.role !== 'SUPERADMIN' && briefingLimit > 0 && hitCount >= briefingLimit) {
      throw new BadRequestException(
        `Batas harian pembuatan briefing AI telah tercapai (maksimal ${briefingLimit} kali sehari). Upgrade paket untuk akses lebih banyak.`,
      );
    }

    return this.aiJob.runAsync(user.id, 'ai_briefing', async () => {
    const briefingResult = await this.fetchAndBuildBriefing(user);
    const newHitCount = hitCount + 1;
    const contentToStore = {
      ...briefingResult,
      hitCount: newHitCount,
    };

    await this.prisma.dailyBriefing.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: todayStart,
        },
      },
      create: {
        userId: user.id,
        date: todayStart,
        content: JSON.stringify(contentToStore),
      },
      update: {
        content: JSON.stringify(contentToStore),
      },
    });

    return contentToStore;
    }); // end aiJob.run
  }

  private async fetchAndBuildBriefing(user: User) {
    const now = new Date();
    const hour = now.getHours();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeDaysLater = new Date(todayStart.getTime() + 4 * 24 * 60 * 60 * 1000); // through end of +3 days

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayDayName = dayNames[now.getDay()];

    // Time-of-day label (Indonesian)
    let timeOfDay: string;
    if (hour >= 5 && hour < 11) timeOfDay = 'pagi';
    else if (hour >= 11 && hour < 15) timeOfDay = 'siang';
    else if (hour >= 15 && hour < 18) timeOfDay = 'sore';
    else timeOfDay = 'malam';

    // Gather everything in parallel; tolerate partial failures.
    const results = await Promise.allSettled([
      // 0: Active class memberships (for today's schedule)
      this.prisma.classMember.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        include: {
          class: { select: { id: true, name: true, day: true, time: true, room: true, lecturer: true } },
        },
      }),
      // 1: Tasks due today + next 3 days, not yet submitted by user
      this.prisma.task.findMany({
        where: {
          class: { members: { some: { userId: user.id } } },
          deadline: { gte: todayStart, lt: threeDaysLater },
          submissions: { none: { userId: user.id } },
        },
        include: { class: { select: { name: true } } },
        orderBy: { deadline: 'asc' },
        take: 15,
      }),
      // 2: Today's transactions (income + expense)
      this.prisma.transaction.findMany({
        where: { userId: user.id, date: { gte: todayStart, lt: tomorrowStart } },
      }),
      // 3: This month's transactions (for monthly expense total + by category)
      this.prisma.transaction.findMany({
        where: { userId: user.id, date: { gte: monthStart } },
      }),
      // 4: Yesterday's expense
      this.prisma.transaction.findMany({
        where: { userId: user.id, type: 'expense', date: { gte: yesterdayStart, lt: todayStart } },
      }),
      // 5: This month's budgets
      this.prisma.categoryBudget.findMany({
        where: { userId: user.id, month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      // 6: Pending todos (due today or overdue / no due date)
      this.prisma.personalTodo.findMany({
        where: {
          userId: user.id,
          status: { in: ['pending', 'overdue'] },
          OR: [{ dueDate: { lt: tomorrowStart } }, { dueDate: null }],
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { sortOrder: 'asc' }],
        take: 20,
      }),
      // 7: Gamification (streak / level)
      this.prisma.userGamification.findUnique({ where: { userId: user.id } }),
      // 8: Saving tree progress
      this.prisma.savingTree.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
      // 9: Active debts (unpaid)
      this.prisma.debt.findMany({
        where: { userId: user.id, isPaid: false },
        select: { description: true, amount: true, debtType: true, personName: true, dueDate: true },
        take: 5,
      }),
      // 10: Active recurring bills
      this.prisma.recurringBill.findMany({
        where: { userId: user.id, isActive: true },
        select: { name: true, amount: true, dueDay: true, lastPaidAt: true },
      }),
      // 11: Bawel setting (for personality stage in briefing)
      this.prisma.bawelSetting.findUnique({ where: { userId: user.id } }),
    ]);

    const classMemberships = results[0].status === 'fulfilled' ? results[0].value : [];
    const upcomingTasks = results[1].status === 'fulfilled' ? results[1].value : [];
    const todayTx = results[2].status === 'fulfilled' ? results[2].value : [];
    const monthTx = results[3].status === 'fulfilled' ? results[3].value : [];
    const yesterdayTx = results[4].status === 'fulfilled' ? results[4].value : [];
    const budgets = results[5].status === 'fulfilled' ? results[5].value : [];
    const pendingTodos = results[6].status === 'fulfilled' ? results[6].value : [];
    const gamification = results[7].status === 'fulfilled' ? results[7].value : null;
    const trees = results[8].status === 'fulfilled' ? results[8].value : [];
    const debts = results[9].status === 'fulfilled' ? (results[9] as any).value : [];
    const bills = results[10].status === 'fulfilled' ? (results[10] as any).value : [];
    const bawelSetting = results[11].status === 'fulfilled' ? (results[11] as any).value : null;

    // ---- Today's schedule ----
    const schedule = classMemberships
      .filter((cm: any) => cm.class.day && cm.class.day.toLowerCase() === todayDayName.toLowerCase())
      .map((cm: any) => ({
        classId: cm.class.id,
        className: cm.class.name,
        time: cm.class.time || '-',
        room: cm.class.room || '-',
        lecturer: cm.class.lecturer || '-',
      }));

    // ---- Deadlines (split: today vs soon) ----
    const deadlines = upcomingTasks.map((d: any) => ({
      id: d.id,
      title: d.title,
      className: d.class?.name ?? null,
      deadline: d.deadline,
      isDueToday: d.deadline >= todayStart && d.deadline < tomorrowStart,
    }));
    const dueTodayCount = deadlines.filter((d: any) => d.isDueToday).length;

    // ---- Finance: today ----
    const todayIncome = todayTx
      .filter((t: any) => t.type === 'income')
      .reduce((s: number, t: any) => s + t.amount, 0);
    const todayExpense = todayTx
      .filter((t: any) => t.type === 'expense')
      .reduce((s: number, t: any) => s + t.amount, 0);
    const todayExpenseByCategory: Record<string, number> = {};
    todayTx
      .filter((t: any) => t.type === 'expense')
      .forEach((t: any) => {
        todayExpenseByCategory[t.category] = (todayExpenseByCategory[t.category] || 0) + t.amount;
      });

    // ---- Finance: month ----
    const monthExpense = monthTx
      .filter((t: any) => t.type === 'expense')
      .reduce((s: number, t: any) => s + t.amount, 0);
    const monthIncome = monthTx
      .filter((t: any) => t.type === 'income')
      .reduce((s: number, t: any) => s + t.amount, 0);
    const monthExpenseByCategory: Record<string, number> = {};
    monthTx
      .filter((t: any) => t.type === 'expense')
      .forEach((t: any) => {
        monthExpenseByCategory[t.category] = (monthExpenseByCategory[t.category] || 0) + t.amount;
      });

    // ---- Budget status (per category, % used) ----
    const budgetStatus = budgets.map((b: any) => {
      const spent = monthExpenseByCategory[b.category] || 0;
      return {
        category: b.category,
        budget: b.amount,
        spent,
        percentage: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
      };
    });
    const overBudget = budgetStatus.filter((b) => b.percentage >= 80);

    // ---- Yesterday's expense ----
    const yesterdayExpense = yesterdayTx.reduce((s: number, t: any) => s + t.amount, 0);

    // ---- Todos ----
    const todos = pendingTodos.map((t: any) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      priority: t.priority,
      status: t.status,
    }));
    const overdueTodoCount = pendingTodos.filter((t: any) => t.status === 'overdue').length;

    // ---- Gamification ----
    const streak = gamification?.currentStreak ?? 0;
    const level = gamification?.level ?? 1;
    const totalXp = gamification?.totalXp ?? 0;

    // ---- Saving trees ----
    const savingTrees = trees.map((t: any) => ({
      name: t.name,
      currentAmount: t.currentAmount,
      targetAmount: t.targetAmount,
      progress: t.targetAmount > 0 ? Math.round((t.currentAmount / t.targetAmount) * 100) : 0,
    }));

    // Bundle gathered data so the frontend can render structured fallbacks.
    const data = {
      date: todayStart,
      dayName: todayDayName,
      timeOfDay,
      schedule,
      deadlines,
      finance: {
        today: { income: todayIncome, expense: todayExpense, byCategory: todayExpenseByCategory },
        month: { income: monthIncome, expense: monthExpense, byCategory: monthExpenseByCategory },
        yesterdayExpense,
        budgetStatus,
      },
      todos,
      gamification: { currentStreak: streak, level, totalXp },
      savingTrees,
    };

    // ---- Build a token-efficient Indonesian prompt for Gemini ----
    const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

    const scheduleText =
      schedule.length > 0
        ? schedule.map((s) => `${s.className} (${s.time}, ruang ${s.room})`).join('; ')
        : 'Tidak ada kelas hari ini';

    const deadlineText =
      deadlines.length > 0
        ? deadlines
            .slice(0, 8)
            .map(
              (d) =>
                `${d.title}${d.className ? ` [${d.className}]` : ''} (${d.isDueToday ? 'HARI INI' : new Date(d.deadline).toLocaleDateString('id-ID')})`,
            )
            .join('; ')
        : 'Tidak ada deadline dalam 3 hari ke depan';

    const todoText =
      todos.length > 0
        ? todos
            .slice(0, 8)
            .map((t) => `${t.title}${t.status === 'overdue' ? ' (TELAT)' : ''} [${t.priority}]`)
            .join('; ')
        : 'Tidak ada todo tertunda';

    const budgetText =
      budgetStatus.length > 0
        ? budgetStatus.map((b) => `${b.category}: ${b.percentage}% (${rp(b.spent)}/${rp(b.budget)})`).join('; ')
        : 'Belum ada budget yang diset bulan ini';

    const treeText =
      savingTrees.length > 0
        ? savingTrees.map((t) => `${t.name}: ${t.progress}% (${rp(t.currentAmount)}/${rp(t.targetAmount)})`).join('; ')
        : 'Tidak ada target tabungan aktif';

    // Debt & bill context (compact)
    const totalDebtOwed = debts.filter((d: any) => d.debtType === 'owed_by_me').reduce((s: number, d: any) => s + d.amount, 0);
    const totalDebtLent = debts.filter((d: any) => d.debtType === 'owed_to_me').reduce((s: number, d: any) => s + d.amount, 0);
    const overdueDebts = debts.filter((d: any) => d.dueDate && new Date(d.dueDate) < now);
    const totalBillsMonthly = bills.reduce((s: number, b: any) => s + b.amount, 0);
    const unpaidBills = bills.filter((b: any) => {
      if (!b.lastPaidAt) return true;
      const lastPaid = new Date(b.lastPaidAt);
      return lastPaid.getMonth() < now.getMonth() || lastPaid.getFullYear() < now.getFullYear();
    });

    let debtBillText = '';
    if (totalDebtOwed > 0) debtBillText += `Hutang aktif: ${rp(totalDebtOwed)}`;
    if (totalDebtLent > 0) debtBillText += `${debtBillText ? '; ' : ''}Piutang: ${rp(totalDebtLent)}`;
    if (overdueDebts.length > 0) debtBillText += ` (${overdueDebts.length} jatuh tempo!)`;
    if (bills.length > 0) debtBillText += `${debtBillText ? '; ' : ''}Tagihan rutin: ${bills.length} item (${rp(totalBillsMonthly)}/bln)`;
    if (unpaidBills.length > 0) debtBillText += `, ${unpaidBills.length} belum dibayar`;
    if (!debtBillText) debtBillText = 'Tidak ada hutang/tagihan aktif';

    // Si Bawel personality stage for briefing tone
    const personalityStage = bawelSetting?.personalityStage || 'NEWBIE';
    const stageHint = personalityStage === 'BESTIE' ? 'Kamu udah kayak bestie user — be extra personal & insightful.'
      : personalityStage === 'SAHABAT' ? 'Kamu udah cukup kenal user — boleh lebih personal.'
      : personalityStage === 'KENAL' ? 'Kamu mulai kenal user — sesuaikan gaya.' : '';

    const prompt = `
Kamu adalah "Si Bawel", asisten pribadi yang ramah, cerdas, dan sedikit cerewet (witty) untuk seorang anak muda Indonesia bernama ${user.fullName}.
Tugasmu membuat "Briefing Hari Ini" yang personal: rangkum hal-hal penting, beri saran yang actionable, kritik halus kalau perlu (misalnya kalau boros atau banyak tugas telat), dan ingatkan hal penting. Gaya bahasa santai khas anak kuliahan, hangat, tidak menggurui.
${stageHint}

KONTEKS HARI INI (${todayDayName}, waktu ${timeOfDay}):
- Jadwal kuliah: ${scheduleText}
- Deadline tugas (hari ini + 3 hari ke depan): ${deadlineText}
- Tugas jatuh tempo HARI INI: ${dueTodayCount}
- Todo tertunda: ${todoText}
- Todo yang telat (overdue): ${overdueTodoCount}
- Keuangan hari ini: pemasukan ${rp(todayIncome)}, pengeluaran ${rp(todayExpense)}
- Pengeluaran kemarin: ${rp(yesterdayExpense)}
- Pengeluaran bulan ini: ${rp(monthExpense)} (pemasukan ${rp(monthIncome)})
- Status budget bulan ini: ${budgetText}
- Hutang & Tagihan: ${debtBillText}
- Target tabungan: ${treeText}
- Gamifikasi: streak ${streak} hari, level ${level}, total XP ${totalXp}

INSTRUKSI OUTPUT:
Balas HANYA dengan JSON valid (TANPA markdown code fence, tanpa teks pembuka/penutup) dengan struktur PERSIS seperti ini:
{
  "greeting": "sapaan hangat personal yang menyebut waktu (${timeOfDay}) dan nama, 1-2 kalimat",
  "headline": "satu kalimat ringkas tentang hal terpenting hari ini",
  "sections": [
    { "icon": "📅", "title": "Jadwal Hari Ini", "items": ["detail kelas/jadwal..."] },
    { "icon": "✅", "title": "Tugas & Deadline", "items": ["detail tugas spesifik beserta deadline..."] },
    { "icon": "💰", "title": "Keuangan", "items": ["detail pengeluaran, budget status, tips hemat..."] },
    { "icon": "🔥", "title": "Gamifikasi & Streak", "items": ["detail streak, level, pencapaian..."] },
    { "icon": "💡", "title": "Tabungan & Target", "items": ["progress tabungan, hutang, tagihan..."] }
  ],
  "suggestions": ["3-5 saran yang SANGAT spesifik dan actionable berdasarkan data"],
  "reminders": ["2-4 pengingat penting yang relevan dengan hari ini"],
  "motivation": "2-3 kalimat menyemangati ATAU kritik halus yang witty sesuai kondisi user"
}

ATURAN PENTING:
- "icon" HANYA boleh salah satu dari: "📅", "💰", "✅", "🔥", "💡".
- Hanya buat section yang relevan (lewati yang datanya kosong).
- Gunakan Bahasa Indonesia santai khas anak kuliahan. Angka uang format "Rp" dengan pemisah ribuan.
- Jangan mengarang data yang tidak ada di konteks.
- SETIAP section HARUS punya minimal 2-3 items yang detail dan spesifik (sebutkan nama tugas, jumlah uang, nama kelas, dll).
- suggestions HARUS 3-5 saran konkret (bukan generik). Contoh: "Kerjain tugas X yang deadline besok dulu sebelum ke kelas Y."
- reminders HARUS 2-4 pengingat. Contoh: "Jangan lupa bayar tagihan WiFi Rp150.000 yang belum dibayar bulan ini."
- motivation HARUS 2-3 kalimat, personal dan relate ke kondisi user (misal boros, streak tinggi, banyak tugas).
- JANGAN terlalu singkat. Briefing harus informatif dan detail agar user merasa terbantu.
`.trim();

    // Default rule-based fallback so the endpoint never throws.
    const fallback = this.buildRuleBasedBriefing(user, data, {
      dueTodayCount,
      overdueTodoCount,
      overBudget,
      todayExpense,
      yesterdayExpense,
      streak,
      timeOfDay,
      rp,
    });

    try {
      const raw = await this.ai.generateText(prompt);
      const cleaned = this.extractBriefingJson(raw);
      const parsed = JSON.parse(cleaned);

      // Minimal shape validation; fall back if the model returned something odd.
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
        return { ...fallback, source: 'fallback', data };
      }

      return {
        greeting: parsed.greeting ?? fallback.greeting,
        headline: parsed.headline ?? fallback.headline,
        sections: parsed.sections ?? fallback.sections,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : fallback.suggestions,
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : fallback.reminders,
        motivation: parsed.motivation ?? fallback.motivation,
        source: 'ai',
        data,
      };
    } catch {
      // AI failed or returned unparseable output -> resilient rule-based response.
      return { ...fallback, source: 'fallback', data };
    }
  }

  /** Extract a JSON object from Gemini output, stripping ```json fences if present. */
  private extractBriefingJson(text: string): string {
    let t = (text || '').trim();
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return t.substring(first, last + 1);
    }
    return t;
  }

  /** Build a sensible rule-based briefing used as the AI fallback. */
  private buildRuleBasedBriefing(
    user: User,
    data: any,
    ctx: {
      dueTodayCount: number;
      overdueTodoCount: number;
      overBudget: Array<{ category: string; percentage: number }>;
      todayExpense: number;
      yesterdayExpense: number;
      streak: number;
      timeOfDay: string;
      rp: (n: number) => string;
    },
  ) {
    const { rp } = ctx;
    const sections: Array<{ icon: string; title: string; items: string[] }> = [];

    if (data.schedule.length > 0) {
      sections.push({
        icon: '📅',
        title: 'Jadwal Hari Ini',
        items: data.schedule.map((s: any) => `${s.className} • ${s.time} • ${s.room}`),
      });
    }

    const taskItems: string[] = [];
    if (ctx.dueTodayCount > 0) taskItems.push(`${ctx.dueTodayCount} tugas jatuh tempo hari ini`);
    if (data.deadlines.length > 0) {
      data.deadlines.slice(0, 5).forEach((d: any) => {
        taskItems.push(`${d.title}${d.isDueToday ? ' (hari ini)' : ''}`);
      });
    }
    if (data.todos.length > 0) taskItems.push(`${data.todos.length} todo tertunda`);
    if (taskItems.length > 0) {
      sections.push({ icon: '✅', title: 'Tugas & Todo', items: taskItems });
    }

    const financeItems: string[] = [
      `Pengeluaran hari ini: ${rp(ctx.todayExpense)}`,
      `Pengeluaran bulan ini: ${rp(data.finance.month.expense)}`,
    ];
    ctx.overBudget.forEach((b) => financeItems.push(`Budget ${b.category} sudah ${b.percentage}%`));
    sections.push({ icon: '💰', title: 'Keuangan', items: financeItems });

    if (ctx.streak > 0) {
      sections.push({ icon: '🔥', title: 'Streak', items: [`Streak ${ctx.streak} hari, jaga terus!`] });
    }

    const suggestions: string[] = [];
    if (ctx.dueTodayCount > 0) suggestions.push('Selesaikan tugas yang jatuh tempo hari ini dulu.');
    if (ctx.overdueTodoCount > 0) suggestions.push(`Beresin ${ctx.overdueTodoCount} todo yang sudah telat.`);
    if (ctx.overBudget.length > 0) suggestions.push('Rem pengeluaran di kategori yang hampir over budget.');
    if (suggestions.length === 0) suggestions.push('Hari ini cukup lengang, manfaatkan buat nyicil tugas.');

    const reminders: string[] = [];
    if (data.schedule.length > 0) reminders.push(`Jangan telat ke kelas ${data.schedule[0].className} jam ${data.schedule[0].time}.`);
    if (ctx.dueTodayCount > 0) reminders.push('Ada deadline hari ini, cek lagi ya.');

    let motivation = 'Pelan-pelan asal konsisten. Kamu pasti bisa! 💪';
    if (ctx.overBudget.length > 0) motivation = 'Dompet butuh kamu lebih sabar belanja minggu ini ya 😅';
    else if (ctx.streak >= 7) motivation = `Streak ${ctx.streak} hari itu keren banget, pertahankan!`;

    const greeting = `Selamat ${ctx.timeOfDay}, ${user.fullName}!`;
    let headline = 'Hari ini terlihat tenang, nikmati sambil nyicil tugas.';
    if (ctx.dueTodayCount > 0) headline = `Ada ${ctx.dueTodayCount} tugas jatuh tempo hari ini.`;
    else if (data.schedule.length > 0) headline = `Kamu punya ${data.schedule.length} kelas hari ini.`;
    else if (ctx.overBudget.length > 0) headline = `Budget ${ctx.overBudget[0].category} kamu udah ${ctx.overBudget[0].percentage}%.`;

    return { greeting, headline, sections, suggestions, reminders, motivation };
  }

  /**
   * Helper: Get active weekly challenge with user's progress.
   */
  private async getWeeklyChallengeForUser(userId: string) {
    const now = new Date();

    const activeChallenge = await this.prisma.weeklyChallenge.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!activeChallenge) return null;

    // Get or create user progress
    let progress = await this.prisma.weeklyChallengeProgress.findUnique({
      where: {
        challengeId_userId: { challengeId: activeChallenge.id, userId },
      },
    });

    if (!progress) {
      progress = await this.prisma.weeklyChallengeProgress.create({
        data: { challengeId: activeChallenge.id, userId, current: 0 },
      });
    }

    const daysLeft = Math.max(
      0,
      Math.ceil((activeChallenge.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    return {
      id: activeChallenge.id,
      title: activeChallenge.title,
      description: activeChallenge.description,
      targetType: activeChallenge.targetType,
      targetValue: activeChallenge.targetValue,
      rewardXp: activeChallenge.rewardXp,
      current: progress.current,
      completed: progress.completed,
      daysLeft,
      startDate: activeChallenge.startDate,
      endDate: activeChallenge.endDate,
    };
  }

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
      { level: 1, name: 'Pemula', minXp: 0 },
      { level: 2, name: 'Mulai Rajin', minXp: 100 },
      { level: 3, name: 'Konsisten', minXp: 300 },
      { level: 4, name: 'Produktif', minXp: 600 },
      { level: 5, name: 'Overachiever', minXp: 1000 },
      { level: 6, name: 'Synapse Pro', minXp: 1500 },
      { level: 7, name: 'Legenda', minXp: 2500 },
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
