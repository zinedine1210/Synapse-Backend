import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { UpdateBawelSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SiBawelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiUsage: AiUsageService,
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

  async getComments(userId: string, page: number = 1, limit: number = 20) {
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

    const reply = await this.ai.generateText(prompt);
    return { reply };
  }

  async getWeeklyRoast(userId: string) {
    // Check AI usage limit
    await this.aiUsage.checkAndRecord(userId, 'weekly_roast');

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weekWhere = { userId, date: { gte: oneWeekAgo } };
    const [typeSums, categorySums, txCount, setting] = await Promise.all([
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
    ]);

    const income = typeSums.find(g => g.type === 'income')?._sum?.amount || 0;
    const expense = typeSums.find(g => g.type === 'expense')?._sum?.amount || 0;

    const byCategory: Record<string, number> = {};
    categorySums.forEach(g => {
      byCategory[g.category] = g._sum.amount || 0;
    });

    const prompt = `Kamu adalah "Si Bawel", asisten keuangan yang nyinyir.
Level: ${setting.level}

Ringkasan keuangan minggu ini:
- Total pemasukan: Rp${income.toLocaleString('id-ID')}
- Total pengeluaran: Rp${expense.toLocaleString('id-ID')}
- Saldo minggu ini: Rp${(income - expense).toLocaleString('id-ID')}
- Breakdown pengeluaran: ${JSON.stringify(byCategory)}
- Jumlah transaksi: ${txCount}

Berikan "Weekly Roast" – evaluasi mingguan yang:
1. Beri nilai 1-10 untuk pengelolaan keuangan minggu ini
2. Highlight pengeluaran terbesar
3. Kasih komentar nyinyir sesuai level
4. Satu tips singkat untuk minggu depan

Format response (JSON):
{ "score": number, "roast": "...", "tip": "...", "biggestSpend": "kategori" }`;

    const result = await this.ai.generateText(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      return { score: 5, roast: result, tip: '', biggestSpend: '' };
    }
  }
}
