import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { AiUsageService } from '../../common/services/ai-usage.service';

@Injectable()
export class InsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
    private readonly aiUsage: AiUsageService,
  ) {}

  /**
   * Weekly/Monthly Summary — aggregated cross-feature insight
   * When range='month', uses calendar month boundaries for accurate totals.
   */
  async getWeeklySummary(userId: string, range?: string) {
    const now = new Date();
    let periodStart: Date;
    let prevStart: Date;
    let prevEnd: Date;

    if (range === 'month' || range === 'this_month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(periodStart.getTime() - 1);
    }

    const [
      thisWeekTx,
      lastWeekTx,
      gamification,
      trees,
      qnaAnswers,
      qnaApproved,
      forumPosts,
      forumReplies,
      loginStreak,
      totalTx,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: periodStart } },
      }),
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: prevStart, lte: prevEnd } },
      }),
      this.prisma.userGamification.findUnique({ where: { userId } }),
      this.prisma.savingTree.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
      // Engagement metrics
      this.prisma.qnaAnswer.count({
        where: { userId, createdAt: { gte: periodStart } },
      }).catch(() => 0),
      this.prisma.qnaAnswer.count({
        where: { userId, isApprovedByAsker: true, createdAt: { gte: periodStart } },
      }).catch(() => 0),
      this.prisma.forumPost.count({
        where: { authorId: userId, createdAt: { gte: periodStart } },
      }).catch(() => 0),
      this.prisma.forumReply.count({
        where: { authorId: userId, createdAt: { gte: periodStart } },
      }).catch(() => 0),
      this.prisma.userGamification.findUnique({
        where: { userId },
        select: { currentStreak: true, longestStreak: true },
      }),
      this.prisma.transaction.count({
        where: { userId, createdAt: { gte: periodStart } },
      }),
    ]);

    // Financial comparison
    const thisWeekExpense = thisWeekTx
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const lastWeekExpense = lastWeekTx
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const thisWeekIncome = thisWeekTx
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);

    const changePercent = lastWeekExpense > 0
      ? Math.round(((thisWeekExpense - lastWeekExpense) / lastWeekExpense) * 100)
      : 0;

    // Top categories this week
    const categorySpending: Record<string, number> = {};
    thisWeekTx.filter(t => t.type === 'expense').forEach(t => {
      categorySpending[t.category] = (categorySpending[t.category] ?? 0) + t.amount;
    });
    const topCategories = Object.entries(categorySpending)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));

    // Pattern alerts (rule-based)
    const alerts: { type: string; message: string }[] = [];
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    // Friday night alert
    if (dayOfWeek === 5 && hour >= 17) {
      const fridaySpend = thisWeekTx
        .filter(t => t.type === 'expense' && new Date(t.date).getDay() === 5)
        .reduce((s, t) => s + t.amount, 0);
      if (fridaySpend > 0) {
        alerts.push({
          type: 'pattern',
          message: `Jumat malam lagi — biasanya kamu habis Rp ${fridaySpend.toLocaleString('id-ID')} di hari Jumat. Pelan-pelan ya!`,
        });
      }
    }

    // End of month alert
    if (now.getDate() >= 25) {
      alerts.push({
        type: 'monthly',
        message: 'Akhir bulan mendekat — cek lagi sisa budget dan tabunganmu.',
      });
    }

    // Tree progress
    const treeProgress = trees.map(t => ({
      name: t.name,
      progress: t.targetAmount > 0 ? Math.round((t.currentAmount / t.targetAmount) * 100) : 0,
      remaining: t.targetAmount - t.currentAmount,
    }));

    return {
      period: { from: periodStart.toISOString(), to: now.toISOString() },
      finance: {
        income: thisWeekIncome,
        expense: thisWeekExpense,
        changePercent,
        changeDirection: changePercent > 0 ? 'more' : changePercent < 0 ? 'less' : 'same',
        topCategories,
      },
      engagement: {
        qnaAnswers: qnaAnswers as number,
        qnaApproved: qnaApproved as number,
        forumPosts: forumPosts as number,
        forumReplies: forumReplies as number,
        loginStreak: loginStreak?.currentStreak ?? 0,
        longestStreak: loginStreak?.longestStreak ?? 0,
        totalTransactions: totalTx,
      },
      gamification: {
        totalXp: gamification?.totalXp ?? 0,
        level: gamification?.level ?? 1,
        streak: gamification?.currentStreak ?? 0,
      },
      trees: treeProgress,
      alerts,
    };
  }

  /**
   * Generate AI-powered insight text from weekly data
   */
  async getAiInsight(userId: string) {
    await this.aiUsage.checkAndRecord(userId, 'ai_insight');
    return this.aiJob.runAsync(userId, 'ai_insight', async () => {
    const summary = await this.getWeeklySummary(userId, 'month');

    const prompt = `Kamu adalah asisten keuangan & engagement untuk anak muda Indonesia.
Berikan insight singkat (maks 3 paragraf) berdasarkan data bulan ini:

Keuangan:
- Pemasukan: Rp ${summary.finance.income.toLocaleString('id-ID')}
- Pengeluaran: Rp ${summary.finance.expense.toLocaleString('id-ID')}
- Perubahan dari periode lalu: ${summary.finance.changePercent}% (${summary.finance.changeDirection === 'less' ? 'lebih hemat' : 'lebih boros'})
- Kategori terbesar: ${summary.finance.topCategories.map(c => `${c.category} (Rp ${c.amount.toLocaleString('id-ID')})`).join(', ')}

Engagement:
- Jawaban QnA: ${summary.engagement.qnaAnswers} (${summary.engagement.qnaApproved} disetujui)
- Forum: ${summary.engagement.forumPosts} post, ${summary.engagement.forumReplies} reply
- Login streak: ${summary.engagement.loginStreak} hari
- Total transaksi dicatat: ${summary.engagement.totalTransactions}
- Level: ${summary.gamification.level} | Streak: ${summary.gamification.streak} hari

Tabungan:
${summary.trees.map(t => `- ${t.name}: ${t.progress}% (sisa Rp ${t.remaining.toLocaleString('id-ID')})`).join('\n') || '- Belum ada pohon tabungan'}

Berikan insight dalam bahasa gaul anak muda Indonesia, singkat, actionable.
Format JSON: { "headline": "...", "body": "...", "tip": "..." }`;

    let result: string;
    try {
      result = await this.ai.generateText(prompt);
    } catch {
      return { ...summary, aiInsight: { headline: 'Insight bulan ini', body: 'AI sedang tidak tersedia. Coba lagi nanti.', tip: '' } };
    }

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const insight = JSON.parse(cleaned);
      return { ...summary, aiInsight: insight };
    } catch {
      return { ...summary, aiInsight: { headline: 'Insight bulan ini', body: result, tip: '' } };
    }
    }); // end aiJob.run
  }
}
