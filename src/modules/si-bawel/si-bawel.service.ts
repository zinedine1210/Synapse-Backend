import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { UpdateBawelSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SiBawelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
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
    const [recentTx, monthTx, budgets, trees] = await Promise.all([
      this.prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 10 }),
      this.prisma.transaction.findMany({ where: { userId, date: { gte: monthStart } } }),
      this.prisma.categoryBudget.findMany({ where: { userId, month: now.getMonth() + 1, year: now.getFullYear() } }),
      this.prisma.savingTree.findMany({ where: { userId }, take: 3 }),
    ]);

    const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const byCategory: Record<string, number> = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
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
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const txs = await this.prisma.transaction.findMany({
      where: { userId, date: { gte: oneWeekAgo } },
    });

    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const byCategory: Record<string, number> = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    });

    const setting = await this.getSetting(userId);

    const prompt = `Kamu adalah "Si Bawel", asisten keuangan yang nyinyir.
Level: ${setting.level}

Ringkasan keuangan minggu ini:
- Total pemasukan: Rp${income.toLocaleString('id-ID')}
- Total pengeluaran: Rp${expense.toLocaleString('id-ID')}
- Saldo minggu ini: Rp${(income - expense).toLocaleString('id-ID')}
- Breakdown pengeluaran: ${JSON.stringify(byCategory)}
- Jumlah transaksi: ${txs.length}

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
