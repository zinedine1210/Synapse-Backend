import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { SetBudgetDto } from './dto/set-budget.dto';
import { CreateTreeDto, TreeTransactionDto } from './dto/create-tree.dto';

@Injectable()
export class DuitTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ── Transactions ──

  async createTransaction(userId: string, dto: CreateTransactionDto) {
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        amount: dto.amount,
        type: dto.type,
        category: dto.category,
        subcategory: dto.subcategory,
        label: dto.label,
        note: dto.note,
        inputMethod: dto.inputMethod ?? 'manual',
        receiptImageUrl: dto.receiptImageUrl,
        linkedTreeId: dto.linkedTreeId,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });

    // Generate Si Bawel comment asynchronously
    this.generateBawelComment(userId, tx.id, dto).catch(() => {});

    return tx;
  }

  async getTransactions(userId: string, query: { month?: number; year?: number; category?: string; type?: string }) {
    const where: any = { userId };

    if (query.month && query.year) {
      const start = new Date(query.year, query.month - 1, 1);
      const end = new Date(query.year, query.month, 0, 23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;

    return this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async deleteTransaction(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan.');
    return this.prisma.transaction.delete({ where: { id } });
  }

  async getSummary(userId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const txs = await this.prisma.transaction.findMany({
      where: { userId, date: { gte: start, lte: end } },
    });

    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Group by category
    const byCategory: Record<string, number> = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    });

    // Get budgets for comparison
    const budgets = await this.prisma.categoryBudget.findMany({
      where: { userId, month, year },
    });

    const categoryReport = Object.entries(byCategory).map(([category, spent]) => {
      const budget = budgets.find(b => b.category === category);
      return {
        category,
        spent,
        budget: budget?.amount ?? null,
        percentage: budget ? Math.round((spent / budget.amount) * 100) : null,
      };
    });

    return {
      month,
      year,
      income,
      expense,
      balance: income - expense,
      transactionCount: txs.length,
      categoryReport,
    };
  }

  // ── Budget ──

  async setBudget(userId: string, dto: SetBudgetDto) {
    return this.prisma.categoryBudget.upsert({
      where: {
        userId_category_month_year: {
          userId,
          category: dto.category,
          month: dto.month,
          year: dto.year,
        },
      },
      update: { amount: dto.amount },
      create: {
        userId,
        category: dto.category,
        amount: dto.amount,
        month: dto.month,
        year: dto.year,
      },
    });
  }

  async getBudgets(userId: string, month: number, year: number) {
    return this.prisma.categoryBudget.findMany({
      where: { userId, month, year },
    });
  }

  // ── Saving Trees ──

  async createTree(userId: string, dto: CreateTreeDto) {
    return this.prisma.savingTree.create({
      data: {
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        treeType: dto.treeType ?? 'oak',
      },
    });
  }

  async getTrees(userId: string) {
    return this.prisma.savingTree.findMany({
      where: { userId },
      include: { transactions: { orderBy: { date: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTreeTransaction(userId: string, treeId: string, dto: TreeTransactionDto) {
    const tree = await this.prisma.savingTree.findFirst({ where: { id: treeId, userId } });
    if (!tree) throw new NotFoundException('Pohon tabungan tidak ditemukan.');

    const newAmount = dto.type === 'deposit'
      ? tree.currentAmount + dto.amount
      : tree.currentAmount - dto.amount;

    const [treeTx] = await this.prisma.$transaction([
      this.prisma.treeTransaction.create({
        data: { treeId, amount: dto.amount, type: dto.type, note: dto.note },
      }),
      this.prisma.savingTree.update({
        where: { id: treeId },
        data: { currentAmount: Math.max(0, newAmount) },
      }),
    ]);

    return treeTx;
  }

  async deleteTree(userId: string, treeId: string) {
    const tree = await this.prisma.savingTree.findFirst({ where: { id: treeId, userId } });
    if (!tree) throw new NotFoundException('Pohon tabungan tidak ditemukan.');
    return this.prisma.savingTree.delete({ where: { id: treeId } });
  }

  // ── AI: Parse natural language input ──

  async parseNaturalInput(userId: string, text: string) {
    const prompt = `Kamu adalah asisten keuangan. Parse input berikut menjadi transaksi keuangan.
Input: "${text}"

Respond dalam JSON format:
{
  "amount": number,
  "type": "income" | "expense",
  "category": string (pilih dari: makanan, transportasi, belanja, hiburan, pendidikan, kesehatan, tagihan, gaji, uang_saku, lainnya),
  "label": string (deskripsi singkat),
  "note": string | null
}

Hanya respond JSON, tanpa markdown.`;

    const result = await this.ai.generateText(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      return { raw: result };
    }
  }

  // ── AI: Si Bawel comment ──

  private async generateBawelComment(userId: string, txId: string, dto: CreateTransactionDto) {
    try {
      const setting = await this.prisma.bawelSetting.findUnique({ where: { userId } });
      if (setting && !setting.isEnabled) return;

      const level = setting?.level ?? 'NORMAL';
      const prompt = `Kamu adalah "Si Bawel", asisten keuangan yang nyinyir tapi sayang.
Level kecerewetan: ${level}
- SANTAI: komentar ringan, jarang
- NORMAL: komentar biasa
- CEREWET: komentar sangat nyinyir dan detail

User baru saja mencatat transaksi:
- Tipe: ${dto.type}
- Kategori: ${dto.category}
- Jumlah: Rp ${dto.amount.toLocaleString('id-ID')}
- Label: ${dto.label}

Berikan komentar singkat (max 2 kalimat) tentang transaksi ini. Bahasa Indonesia, casual.
Tentukan juga level komentar: "info", "warning", atau "praise".

Format response (JSON only):
{ "comment": "...", "level": "info|warning|praise" }`;

      const result = await this.ai.generateText(prompt);
      const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

      await this.prisma.transaction.update({
        where: { id: txId },
        data: { bawelComment: parsed.comment, bawelLevel: parsed.level },
      });
    } catch (e) {
      // Silently fail – bawel comment is non-critical
    }
  }
}
