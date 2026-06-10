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

  async chat(userId: string, message: string) {
    const setting = await this.getSetting(userId);

    // Get recent transactions for context
    const recentTx = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 10,
    });

    const txSummary = recentTx.map(t =>
      `${t.type === 'income' ? '+' : '-'} Rp${t.amount.toLocaleString('id-ID')} (${t.category}: ${t.label})`
    ).join('\n');

    const prompt = `Kamu adalah "Si Bawel", asisten keuangan virtual yang nyinyir tapi baik hati.
Level kecerewetan: ${setting.level}
- SANTAI: santai, supportive, jarang ceramah
- NORMAL: balanced, kasih saran jika perlu
- CEREWET: super nyinyir, selalu ada komentar pedas tapi penuh sayang

Riwayat transaksi terbaru user:
${txSummary || 'Belum ada transaksi.'}

User bertanya: "${message}"

Jawab dalam bahasa Indonesia, casual, sesuai level kecerewetan.
Jika user tanya tentang keuangan, berikan saran praktis.
Max 3-4 kalimat.`;

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
