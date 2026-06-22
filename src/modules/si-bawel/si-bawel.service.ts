import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { UpdateBawelSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SiBawelService {
  private readonly logger = new Logger(SiBawelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiUsage: AiUsageService,
    private readonly aiJob: AiJobService,
  ) {}

  async getSetting(userId: string) {
    const setting = await this.prisma.bawelSetting.findUnique({ where: { userId } });
    return setting ?? { userId, level: 'NORMAL', isEnabled: true };
  }

  async updateSetting(userId: string, dto: UpdateBawelSettingDto) {
    return this.prisma.bawelSetting.upsert({
      where: { userId },
      update: { ...dto },
      create: { userId, level: dto.level ?? 'NORMAL', isEnabled: dto.isEnabled ?? true },
    });
  }

  async getComments(userId: string, page: number = 1, limit: number = 10) {
    const where = { userId, bawelComment: { not: null } };
    const [comments, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true, amount: true, type: true, category: true, label: true,
          bawelComment: true, bawelLevel: true, date: true, createdAt: true,
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { comments, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async chat(userId: string, message: string) {
    const setting = await this.getSetting(userId);

    // Get rich financial context
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [recentTx, monthSums, categorySums, budgets, trees] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        select: { type: true, amount: true, category: true, label: true, date: true },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: { userId, type: 'expense', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.categoryBudget.findMany({
        where: { userId, month: now.getMonth() + 1, year: now.getFullYear() },
        select: { category: true, amount: true },
      }),
      this.prisma.savingTree.findMany({
        where: { userId },
        select: { name: true, currentAmount: true, targetAmount: true },
        take: 3,
      }),
    ]);

    const monthIncome = monthSums.find(g => g.type === 'income')?._sum?.amount || 0;
    const monthExpense = monthSums.find(g => g.type === 'expense')?._sum?.amount || 0;

    const byCategory: Record<string, number> = {};
    categorySums.forEach(g => {
      byCategory[g.category] = g._sum.amount || 0;
    });

    const budgetStatus = budgets.map(b => {
      const spent = byCategory[b.category] ?? 0;
      return `${b.category}: Rp${spent.toLocaleString('id-ID')} / Rp${b.amount.toLocaleString('id-ID')} (${Math.round((spent / b.amount) * 100)}%)`;
    }).join('\n');

    const treeStatus = trees.map(t =>
      `${t.name}: ${Math.round((t.currentAmount / t.targetAmount) * 100)}% (Rp${t.currentAmount.toLocaleString('id-ID')} / Rp${t.targetAmount.toLocaleString('id-ID')})`
    ).join('\n');

    const txSummary = recentTx.map(t =>
      `${t.type === 'income' ? '+' : '-'} Rp${t.amount.toLocaleString('id-ID')} (${t.category}: ${t.label}) - ${t.date.toLocaleDateString('id-ID')}`
    ).join('\n');

    const prompt = `Kamu adalah "Si Bawel", asisten keuangan virtual yang nyinyir tapi baik hati.
Level kecerewetan: ${setting.level}
- SANTAI: santai, supportive, jarang ceramah
- NORMAL: balanced, kasih saran praktis
- CEREWET: super nyinyir, selalu ada komentar pedas tapi penuh sayang, detail banget

📊 Kondisi Keuangan Bulan Ini:
- Total pemasukan: Rp${monthIncome.toLocaleString('id-ID')}
- Total pengeluaran: Rp${monthExpense.toLocaleString('id-ID')}
- Saldo bulan ini: Rp${(monthIncome - monthExpense).toLocaleString('id-ID')}

${budgetStatus ? `📋 Status Budget:\n${budgetStatus}` : 'Budget belum diatur.'}

${treeStatus ? `🌳 Pohon Tabungan:\n${treeStatus}` : 'Belum ada pohon tabungan.'}

📝 Transaksi Terbaru:
${txSummary || 'Belum ada transaksi.'}

User bertanya: "${message}"

Jawab dalam bahasa Indonesia, casual, sesuai level kecerewetan.
Jika user tanya tentang keuangan, berikan saran praktis berdasarkan data di atas.
Selalu sebut angka nyata jika relevan.
Max 4-5 kalimat.`;

    const reply = await this.ai.generateText(prompt).catch(() =>
      'Aduh, aku lagi nge-lag nih. Coba tanya lagi nanti ya~ 😅',
    );
    return { reply };
  }

  async generateWeeklyRoast(userId: string) {
    try {
      await this.aiUsage.checkAndRecord(userId, 'weekly_roast');
    } catch (error: any) {
      if (error?.status === 403) throw error;
      this.logger.warn(`checkAndRecord failed for weekly_roast: ${error?.message}`);
    }

    return this.aiJob.runAsync(userId, 'weekly_roast', () => this.runWeeklyRoastLogic(userId));
  }

  private async runWeeklyRoastLogic(userId: string) {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const weekWhere = { userId, date: { gte: oneWeekAgo } };
      const [typeSums, categorySums, txCount, setting, recentTx] = await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['type'],
          where: weekWhere,
          _sum: { amount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ['category'],
          where: { ...weekWhere, type: 'expense' },
          _sum: { amount: true },
        }),
        this.prisma.transaction.count({ where: weekWhere }),
        this.getSetting(userId),
        this.prisma.transaction.findMany({
          where: { ...weekWhere, type: 'expense' },
          select: { label: true, amount: true, category: true, date: true },
          orderBy: { amount: 'desc' },
          take: 15,
        }),
      ]);

      const income = typeSums.find(g => g.type === 'income')?._sum?.amount || 0;
      const expense = typeSums.find(g => g.type === 'expense')?._sum?.amount || 0;

      const byCategory: Record<string, number> = {};
      categorySums.forEach(g => {
        byCategory[g.category] = g._sum.amount || 0;
      });

      if (txCount === 0) {
        return {
          score: 0,
          roast: 'Belum ada transaksi minggu ini. Mulai catat pengeluaranmu biar bisa di-roast! 😤',
          tip: 'Catat minimal 1 transaksi per hari.',
          biggestSpend: '-',
          unnecessarySpending: [],
          advice: [],
        };
      }

      // List individual transactions for AI to analyze
      const txList = recentTx.map(t =>
        `- Rp${t.amount.toLocaleString('id-ID')} | ${t.category} | "${t.label}" | ${t.date.toLocaleDateString('id-ID')}`
      ).join('\n');

      const prompt = `Kamu adalah "Si Bawel", financial advisor untuk anak muda Indonesia yang nyinyir tapi peduli.
Level kecerewetan: ${setting.level}

DATA KEUANGAN MINGGU INI:
- Total pemasukan: Rp${Number(income).toLocaleString('id-ID')}
- Total pengeluaran: Rp${Number(expense).toLocaleString('id-ID')}
- Saldo: Rp${Number(Number(income) - Number(expense)).toLocaleString('id-ID')}
- Breakdown per kategori: ${JSON.stringify(byCategory)}
- Jumlah transaksi: ${txCount}

DETAIL TRANSAKSI PENGELUARAN:
${txList}

TUGASMU:
1. Beri skor 1-10 untuk pengelolaan keuangan minggu ini
2. Roast/komentarin pengeluarannya dengan nyinyir tapi lucu
3. Identifikasi 2-4 transaksi yang SEBENERNYA GAK PERLU (impulsive, bisa ditahan, dll). Jelaskan kenapa
4. Kasih 3 nasehat keuangan yang relate sama anak muda jaman sekarang (misal soal FOMO spending, boba trap, laundry vs cuci sendiri, masak vs beli, dll)
5. Satu tips actionable untuk minggu depan
6. Highlight pengeluaran terbesar

Format response (JSON):
{
  "score": number,
  "roast": "komentar nyinyir 2-3 kalimat tentang pengeluaran minggu ini",
  "biggestSpend": "nama kategori",
  "tip": "tips singkat untuk minggu depan",
  "unnecessarySpending": [
    { "item": "nama transaksi", "amount": number, "reason": "kenapa ini sebenernya gak perlu" }
  ],
  "advice": [
    "nasehat 1 yang relate sama anak muda",
    "nasehat 2",
    "nasehat 3"
  ],
  "savingPotential": number
}

PENTING:
- savingPotential = total dari semua unnecessarySpending.amount
- Bahasa casual, gaul, relatable buat anak kuliahan
- Jangan terlalu galak, tetep supportif
- Kalau pengeluarannya wajar semua, tetep kasih saran untuk improve`;

      try {
        const result = await this.ai.generateText(prompt);
        const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        // Ensure arrays exist
        if (!Array.isArray(parsed.unnecessarySpending)) parsed.unnecessarySpending = [];
        if (!Array.isArray(parsed.advice)) parsed.advice = [];
        if (typeof parsed.savingPotential !== 'number') {
          parsed.savingPotential = parsed.unnecessarySpending.reduce((s: number, item: any) => s + (item.amount || 0), 0);
        }
        return parsed;
      } catch {
        const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
        return {
          score: Number(expense) > Number(income) ? 4 : 7,
          roast: `Minggu ini pengeluaranmu Rp${Number(expense).toLocaleString('id-ID')} dari ${txCount} transaksi. ${topCategory ? `Paling boros di ${topCategory[0]}.` : ''} Atur lagi ya!`,
          tip: 'Coba kurangi pengeluaran di kategori terbesar minggu depan.',
          biggestSpend: topCategory?.[0] || '-',
          unnecessarySpending: [],
          advice: ['Coba masak sendiri seminggu sekali', 'Bawa botol minum biar gak beli terus', 'Pikir 24 jam sebelum beli barang non-esensial'],
          savingPotential: 0,
        };
      }
    } catch (error: any) {
      // If DB queries fail (missing table, etc.), return a safe fallback
      this.logger.warn(`runWeeklyRoastLogic failed: ${error?.message}`);
      return {
        score: 5,
        roast: 'Gak bisa ngecek data keuanganmu nih. Pastikan udah catat transaksi dulu ya!',
        tip: 'Mulai catat pengeluaran harianmu biar bisa di-roast minggu depan.',
        biggestSpend: '-',
      };
    }
  }
}
