import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';
import { UpdatePlanConfigDto } from './dto/update-plan-config.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);
  private readonly supabaseAdmin: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async getSystemAnalytics() {
    const [
      totalUsers,
      proUsers,
      totalClasses,
      totalMaterials,
      processingMaterials,
      totalPayments,
      successPayments,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { plan: 'PRO' } }),
      this.prisma.class.count(),
      this.prisma.material.count(),
      this.prisma.material.count({ where: { status: 'PROCESSING' } }),
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { transactionStatus: 'settlement' } }),
      this.prisma.payment.aggregate({
        where: { transactionStatus: 'settlement' },
        _sum: { grossAmount: true },
      }),
    ]);

    return {
      users: { total: totalUsers, pro: proUsers, free: totalUsers - proUsers },
      classes: { total: totalClasses },
      materials: { total: totalMaterials, processing: processingMaterials },
      payments: {
        total: totalPayments,
        success: successPayments,
        totalRevenue: totalRevenue._sum.grossAmount ?? 0,
      },
    };
  }

  async getAllUsers(page = 1, limit = 50) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          plan: true,
          uploadCount: true,
          createdAt: true,
          _count: { select: { classes: true, payments: true } },
        },
      }),
      this.prisma.user.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPlanConfigs() {
    return this.prisma.pricingPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async updatePlanConfig(plan: string, dto: UpdatePlanConfigDto) {
    return this.prisma.pricingPlan.update({
      where: { name: plan },
      data: dto,
    });
  }

  async createPricingPlan(dto: any) {
    return this.prisma.pricingPlan.create({
      data: dto,
    });
  }

  async updatePricingPlan(id: string, dto: any) {
    return this.prisma.pricingPlan.update({
      where: { id },
      data: dto,
    });
  }

  async deletePricingPlan(id: string) {
    return this.prisma.pricingPlan.delete({
      where: { id },
    });
  }

  async assignUserPlan(userId: string, planName: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: planName },
    });
  }

  async createUser(dto: CreateUserDto) {
    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await this.supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.fullName },
    });

    if (authError) {
      this.logger.warn(`Gagal membuat user Supabase: ${authError.message}`);
      throw new BadRequestException(authError.message);
    }

    // 2. Create user in local DB
    const user = await this.prisma.user.create({
      data: {
        id: authData.user.id,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
      },
    });

    this.logger.log(`User dibuat oleh superadmin: ${user.email}`);
    return { message: 'User berhasil dibuat.', user };
  }

  async deleteUser(userId: string) {
    // 1. Check user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (user.role === 'SUPERADMIN') {
      throw new BadRequestException('Tidak bisa menghapus akun SUPERADMIN.');
    }

    // 2. Delete from local DB (cascade will handle relations)
    await this.prisma.user.delete({ where: { id: userId } });

    // 3. Delete from Supabase Auth
    const { error: authError } = await this.supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      this.logger.warn(`User dihapus dari DB tapi gagal hapus dari Supabase: ${authError.message}`);
    }

    this.logger.log(`User dihapus oleh superadmin: ${user.email}`);
    return { message: 'User berhasil dihapus.' };
  }

  async getAllClasses(page = 1, limit = 50) {
    const [data, total] = await Promise.all([
      this.prisma.class.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          ownerId: true,
          code: true,
          createdAt: true,
          _count: { select: { members: true, sessions: true, forumPosts: true, tasks: true } },
          members: {
            where: { role: 'OWNER' },
            select: { user: { select: { fullName: true, email: true } } },
            take: 1,
          },
        },
      }),
      this.prisma.class.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async deleteClass(id: string) {
    await this.prisma.class.delete({ where: { id } });
    return { message: 'Kelas berhasil dihapus.' };
  }

  async getForumStats() {
    const [totalPosts, totalReplies, postsToday, activeClasses] = await Promise.all([
      this.prisma.forumPost.count(),
      this.prisma.forumReply.count(),
      this.prisma.forumPost.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.forumPost.groupBy({
        by: ['classId'],
        _count: true,
        orderBy: { _count: { classId: 'desc' } },
        take: 10,
      }),
    ]);
    return { totalPosts, totalReplies, postsToday, activeClasses: activeClasses.length };
  }

  async getAcademicStats() {
    const [
      totalTasks,
      totalSubmissions,
      totalQuizzes,
      totalAttempts,
      avgScore,
      passedAttempts,
      examPredictions,
      totalMaterials,
      activeMaterials,
      materialsByStatus,
    ] = await Promise.all([
      this.prisma.task.count(),
      this.prisma.taskSubmission.count(),
      this.prisma.quiz.count(),
      this.prisma.quizAttempt.count(),
      this.prisma.quizAttempt.aggregate({ _avg: { score: true } }),
      this.prisma.quizAttempt.count({ where: { passed: true } }),
      this.prisma.examPrediction.count(),
      this.prisma.material.count(),
      this.prisma.material.count({ where: { status: 'SUCCESS' } }),
      this.prisma.material.groupBy({ by: ['status'], _count: true }),
    ]);

    const submissionRate = totalTasks > 0 ? Math.round((totalSubmissions / totalTasks) * 100) : 0;
    const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

    return {
      tasks: { total: totalTasks, submissions: totalSubmissions, submissionRate },
      quizzes: {
        total: totalQuizzes,
        attempts: totalAttempts,
        avgScore: Math.round(avgScore._avg.score ?? 0),
        passRate,
      },
      examPredictions,
      materials: {
        total: totalMaterials,
        active: activeMaterials,
        byStatus: materialsByStatus.map((m) => ({ status: m.status, count: m._count })),
      },
    };
  }

  async getDuitTrackerStats() {
    const today = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      totalTx,
      todayTx,
      uniqueUsers,
      expenseSum,
      incomeSum,
      categoryBreakdown,
      totalTrees,
      totalSaved,
      bawelEnabled,
      receiptScans,
    ] = await Promise.all([
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { createdAt: { gte: today } } }),
      this.prisma.transaction.groupBy({ by: ['userId'], _count: true }).then((r) => r.length),
      this.prisma.transaction.aggregate({ where: { type: 'expense' }, _sum: { amount: true } }),
      this.prisma.transaction.aggregate({ where: { type: 'income' }, _sum: { amount: true } }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        _count: true,
        _sum: { amount: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10,
      }),
      this.prisma.savingTree.count(),
      this.prisma.savingTree.aggregate({ _sum: { currentAmount: true } }),
      this.prisma.bawelSetting.count({ where: { isEnabled: true } }),
      this.prisma.transaction.count({ where: { inputMethod: 'receipt' } }),
    ]);

    return {
      transactions: { total: totalTx, today: todayTx, uniqueUsers },
      money: {
        totalExpense: expenseSum._sum.amount ?? 0,
        totalIncome: incomeSum._sum.amount ?? 0,
      },
      categories: categoryBreakdown.map((c) => ({
        category: c.category,
        count: c._count,
        amount: c._sum.amount ?? 0,
      })),
      savingTrees: { total: totalTrees, totalSaved: totalSaved._sum.currentAmount ?? 0 },
      bawel: { enabled: bawelEnabled },
      receiptScans: { total: receiptScans },
    };
  }

  async getGamificationStats() {
    const [
      totalUsers,
      totalXpAgg,
      activeStreaks,
      avgStreak,
      longestEver,
      levelDistribution,
      xpBySource,
      topUsers,
    ] = await Promise.all([
      this.prisma.userGamification.count(),
      this.prisma.userGamification.aggregate({ _sum: { totalXp: true } }),
      this.prisma.userGamification.count({ where: { currentStreak: { gt: 0 } } }),
      this.prisma.userGamification.aggregate({ _avg: { currentStreak: true } }),
      this.prisma.userGamification.aggregate({ _max: { longestStreak: true } }),
      this.prisma.userGamification.groupBy({
        by: ['level'],
        _count: true,
        orderBy: { level: 'asc' },
      }),
      this.prisma.xpTransaction.groupBy({
        by: ['source'],
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.userGamification.findMany({
        orderBy: { totalXp: 'desc' },
        take: 10,
        include: { user: { select: { fullName: true, email: true } } },
      }),
    ]);

    return {
      totalUsers,
      totalXp: totalXpAgg._sum.totalXp ?? 0,
      streaks: {
        active: activeStreaks,
        avgStreak: Math.round(avgStreak._avg.currentStreak ?? 0),
        longestEver: longestEver._max.longestStreak ?? 0,
      },
      levelDistribution: levelDistribution.map((l) => ({ level: l.level, count: l._count })),
      xpBySource: xpBySource.map((x) => ({
        source: x.source,
        totalXp: x._sum.amount ?? 0,
        count: x._count,
      })),
      topUsers: topUsers.map((u) => ({
        name: u.user.fullName,
        email: u.user.email,
        level: u.level,
        xp: u.totalXp,
        streak: u.currentStreak,
      })),
    };
  }

  async getQnaStats() {
    const [
      totalQuestions,
      unansweredQuestions,
      totalAnswers,
      reportedAnswers,
      topContributors,
      categoryData,
    ] = await Promise.all([
      this.prisma.qnaQuestion.count(),
      this.prisma.qnaQuestion.count({ where: { status: 'open' } }),
      this.prisma.qnaAnswer.count(),
      this.prisma.qnaAnswer.count({ where: { reportCount: { gt: 0 } } }),
      this.prisma.userReputation.findMany({
        orderBy: { score: 'desc' },
        take: 10,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.qnaQuestion.findMany({
        select: { category: true },
      }),
    ]);

    // Aggregate categories from string arrays
    const catMap: Record<string, number> = {};
    for (const q of categoryData) {
      for (const cat of q.category) {
        catMap[cat] = (catMap[cat] ?? 0) + 1;
      }
    }
    const categories = Object.entries(catMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const answerRate = totalQuestions > 0
      ? Math.round(((totalQuestions - unansweredQuestions) / totalQuestions) * 100)
      : 0;

    return {
      questions: { total: totalQuestions, unanswered: unansweredQuestions },
      answers: { total: totalAnswers, reported: reportedAnswers },
      answerRate,
      topContributors: topContributors.map((c) => ({
        name: c.user.fullName,
        email: c.user.email,
        score: c.score,
        approved: c.answersApproved,
      })),
      categories,
    };
  }

  async getSystemStats() {
    const today = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      totalNotifications,
      unreadNotifications,
      briefingsToday,
      totalBriefings,
      totalSplitBills,
      splitBillAmount,
      totalTodos,
      completedTodos,
      totalKolektif,
      kolektifCollected,
    ] = await Promise.all([
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { isRead: false } }),
      this.prisma.dailyBriefing.count({ where: { createdAt: { gte: today } } }),
      this.prisma.dailyBriefing.count(),
      this.prisma.splitBill.count(),
      this.prisma.splitBill.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.personalTodo.count(),
      this.prisma.personalTodo.count({ where: { status: 'done' } }),
      this.prisma.kolektif.count(),
      this.prisma.kolektifTransaction.aggregate({
        where: { type: 'IN' },
        _sum: { amount: true },
      }),
    ]);

    const completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

    return {
      notifications: { total: totalNotifications, unread: unreadNotifications },
      briefings: { today: briefingsToday, total: totalBriefings },
      splitBills: { total: totalSplitBills, totalAmount: splitBillAmount._sum.totalAmount ?? 0 },
      todos: { completionRate, completed: completedTodos, total: totalTodos },
      kolektif: { total: totalKolektif, totalCollected: kolektifCollected._sum.amount ?? 0 },
    };
  }
}
