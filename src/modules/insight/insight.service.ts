import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class InsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Weekly Summary — aggregated cross-feature insight
   */
  async getWeeklySummary(userId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      thisWeekTx,
      lastWeekTx,
      todosCompleted,
      todosTotal,
      gamification,
      trees,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: weekAgo } },
      }),
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: lastWeek, lt: weekAgo } },
      }),
      this.prisma.personalTodo.count({
        where: { userId, status: 'done', updatedAt: { gte: weekAgo } },
      }),
      this.prisma.personalTodo.count({
        where: { userId, createdAt: { gte: weekAgo } },
      }),
      this.prisma.userGamification.findUnique({ where: { userId } }),
      this.prisma.savingTree.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
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
      period: { from: weekAgo.toISOString(), to: now.toISOString() },
      finance: {
        income: thisWeekIncome,
        expense: thisWeekExpense,
        changePercent,
        changeDirection: changePercent > 0 ? 'more' : changePercent < 0 ? 'less' : 'same',
        topCategories,
      },
      productivity: {
        todosCompleted,
        todosTotal,
        completionRate: todosTotal > 0 ? Math.round((todosCompleted / todosTotal) * 100) : 0,
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
    const summary = await this.getWeeklySummary(userId);

    const prompt = `Kamu adalah asisten keuangan & produktivitas untuk mahasiswa Indonesia.
Berikan insight singkat (maks 3 paragraf) berdasarkan data minggu ini:

Keuangan:
- Pemasukan: Rp ${summary.finance.income.toLocaleString('id-ID')}
- Pengeluaran: Rp ${summary.finance.expense.toLocaleString('id-ID')}
- Perubahan dari minggu lalu: ${summary.finance.changePercent}% (${summary.finance.changeDirection === 'less' ? 'lebih hemat' : 'lebih boros'})
- Kategori terbesar: ${summary.finance.topCategories.map(c => `${c.category} (Rp ${c.amount.toLocaleString('id-ID')})`).join(', ')}

Produktivitas:
- Todo selesai: ${summary.productivity.todosCompleted}/${summary.productivity.todosTotal} (${summary.productivity.completionRate}%)
- Streak: ${summary.gamification.streak} hari
- Level: ${summary.gamification.level}

Tabungan:
${summary.trees.map(t => `- ${t.name}: ${t.progress}% (sisa Rp ${t.remaining.toLocaleString('id-ID')})`).join('\n') || '- Belum ada pohon tabungan'}

Berikan insight dalam bahasa gaul mahasiswa Indonesia, singkat, actionable.
Format JSON: { "headline": "...", "body": "...", "tip": "..." }`;

    const result = await this.ai.generateText(prompt);

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const insight = JSON.parse(cleaned);
      return { ...summary, aiInsight: insight };
    } catch {
      return { ...summary, aiInsight: { headline: 'Insight minggu ini', body: result, tip: '' } };
    }
  }
}
