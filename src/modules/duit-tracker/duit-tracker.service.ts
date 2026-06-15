import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationService } from '../notification/notification.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { SetBudgetDto } from './dto/set-budget.dto';
import { CreateTreeDto, TreeTransactionDto } from './dto/create-tree.dto';
import { UpdateTreeDto } from './dto/update-tree.dto';

// Rule-based keyword mapping untuk hemat token AI
const EXPENSE_KEYWORDS: Record<string, string[]> = {
  'makanan': ['makan', 'nasi', 'ayam', 'bakso', 'mie', 'sate', 'warteg', 'padang', 'lauk', 'lunch', 'dinner', 'breakfast', 'sarapan'],
  'minuman': ['kopi', 'coffee', 'teh', 'boba', 'jus', 'minum', 'susu', 'starbucks', 'janji jiwa', 'kenu'],
  'transportasi': ['ojol', 'grab', 'gojek', 'bensin', 'parkir', 'tol', 'bus', 'kereta', 'taxi', 'angkot', 'mrt', 'lrt', 'transport'],
  'belanja': ['shopee', 'tokopedia', 'lazada', 'beli', 'belanja', 'toko', 'baju', 'celana', 'sepatu'],
  'hiburan': ['nonton', 'game', 'spotify', 'netflix', 'youtube', 'bioskop', 'konser', 'main'],
  'tagihan': ['listrik', 'wifi', 'internet', 'pulsa', 'pdam', 'air', 'token', 'bayar'],
  'kesehatan': ['obat', 'dokter', 'apotek', 'rumah sakit', 'klinik', 'vitamin'],
  'pendidikan': ['buku', 'fotokopi', 'print', 'alat tulis', 'kursus', 'les'],
  'kos': ['kos', 'kontrakan', 'sewa', 'rent'],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
  'gaji': ['gaji', 'salary', 'upah'],
  'freelance': ['freelance', 'project', 'proyek', 'kerja'],
  'kiriman': ['transfer', 'kiriman', 'mama', 'papa', 'ortu', 'orang tua', 'dapat'],
  'beasiswa': ['beasiswa', 'scholarship'],
  'bonus': ['bonus', 'thr', 'insentif'],
  'jualan': ['jualan', 'jual', 'laku'],
};

function parseAmountFromText(text: string): number | null {
  const lower = text.toLowerCase().replace(/\./g, '').replace(/,/g, '');
  // "25rb" / "25ribu" / "25k"
  let match = lower.match(/(\d+)\s*(rb|ribu|k)\b/);
  if (match) return parseInt(match[1]) * 1000;
  // "2.5jt" / "2juta" / "2,5 juta"
  match = lower.match(/([\d,\.]+)\s*(jt|juta|m)\b/);
  if (match) return parseFloat(match[1].replace(',', '.')) * 1000000;
  // plain number
  match = lower.match(/(\d{4,})/);
  if (match) return parseInt(match[1]);
  // small numbers with context (e.g. "50" in "makan 50")
  match = lower.match(/(\d{2,3})$/);
  if (match) return parseInt(match[1]) * 1000;
  return null;
}

function ruleBasedParse(text: string): { amount: number; type: string; category: string; label: string } | null {
  const amount = parseAmountFromText(text);
  if (!amount) return null;

  const lower = text.toLowerCase();

  // Check income keywords first
  for (const [cat, keywords] of Object.entries(INCOME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return { amount, type: 'income', category: cat, label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text };
    }
  }

  // Check expense keywords
  for (const [cat, keywords] of Object.entries(EXPENSE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return { amount, type: 'expense', category: cat, label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text };
    }
  }

  // Default: has amount but no keyword match
  return { amount, type: 'expense', category: 'lainnya', label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text };
}

@Injectable()
export class DuitTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly notificationService: NotificationService,
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

    // Generate Si Bawel comment asynchronously (Disabled automatically to save tokens)
    // this.generateBawelComment(userId, tx.id, dto).catch(() => {});

    // Check budget alert for expense transactions
    if (dto.type === 'expense') {
      this.checkBudgetAlert(userId, dto.category, tx.date).catch(() => {});
    }

    return tx;
  }

  async generateBawelCommentManual(userId: string, txId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, userId },
    });
    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan.');
    }

    const dto = {
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      subcategory: tx.subcategory || undefined,
      label: tx.label,
      note: tx.note || undefined,
      inputMethod: tx.inputMethod,
      receiptImageUrl: tx.receiptImageUrl || undefined,
      linkedTreeId: tx.linkedTreeId || undefined,
      date: tx.date.toISOString(),
    };

    try {
      await this.generateBawelComment(userId, tx.id, dto);
    } catch {
      throw new BadRequestException('Gagal menghasilkan komentar dari Si Bawel.');
    }

    const updatedTx = await this.prisma.transaction.findUnique({
      where: { id: txId },
    });

    if (!updatedTx?.bawelComment) {
      throw new BadRequestException('Gagal menghasilkan komentar dari Si Bawel.');
    }

    return updatedTx;
  }

  async getTransactions(userId: string, query: { month?: number; year?: number; category?: string; type?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const where: any = { userId };

    if (query.startDate && query.endDate) {
      where.date = { gte: new Date(query.startDate), lte: new Date(query.endDate + 'T23:59:59.999Z') };
    } else if (query.month && query.year) {
      const start = new Date(query.year, query.month - 1, 1);
      const end = new Date(query.year, query.month, 0, 23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;

    const page = query.page || 1;
    const limit = query.limit || 10;

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async deleteTransaction(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan.');
    return this.prisma.transaction.delete({ where: { id } });
  }

  async updateTransaction(userId: string, id: string, dto: UpdateTransactionDto) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan.');
    // Only allow editing within 24 hours
    const hoursSinceCreation = (Date.now() - tx.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) throw new ForbiddenException('Transaksi hanya bisa diedit dalam 24 jam.');

    const data: any = { ...dto };
    if (dto.date) data.date = new Date(dto.date);

    return this.prisma.transaction.update({ where: { id }, data });
  }

  async getSummary(userId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const dateWhere = { userId, date: { gte: start, lte: end } };

    // Use aggregates instead of loading all rows
    const [typeSums, categorySums, txCount, budgets] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: dateWhere,
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: { ...dateWhere, type: 'expense' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({ where: dateWhere }),
      this.prisma.categoryBudget.findMany({ where: { userId, month, year } }),
    ]);

    const income = typeSums.find(g => g.type === 'income')?._sum?.amount || 0;
    const expense = typeSums.find(g => g.type === 'expense')?._sum?.amount || 0;

    const categoryReport = categorySums.map(g => {
      const budget = budgets.find(b => b.category === g.category);
      const spent = g._sum.amount || 0;
      return {
        category: g.category,
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
      transactionCount: txCount,
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

  async deleteBudget(userId: string, id: string) {
    const budget = await this.prisma.categoryBudget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget tidak ditemukan');
    if (budget.userId !== userId) throw new ForbiddenException('Tidak memiliki akses');
    await this.prisma.categoryBudget.delete({ where: { id } });
    return { success: true };
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

  async updateTree(userId: string, treeId: string, dto: UpdateTreeDto) {
    const tree = await this.prisma.savingTree.findFirst({ where: { id: treeId, userId } });
    if (!tree) throw new NotFoundException('Pohon tabungan tidak ditemukan.');

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.targetAmount) data.targetAmount = dto.targetAmount;
    if (dto.treeType) data.treeType = dto.treeType;
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;

    return this.prisma.savingTree.update({
      where: { id: treeId },
      data,
      include: { transactions: { orderBy: { date: 'desc' }, take: 5 } },
    });
  }

  // ── AI: Parse natural language input ──

  async parseNaturalInput(userId: string, text: string) {
    // Priority 1: Rule-based parsing (hemat token AI)
    const ruleBased = ruleBasedParse(text);
    if (ruleBased) {
      return { ...ruleBased, parsedBy: 'rule' };
    }

    // Priority 2: AI parsing (jika rule tidak match)
    const prompt = `Kamu adalah asisten keuangan. Parse input berikut menjadi transaksi keuangan.
Input: "${text}"

Kategori expense: makanan, minuman, transportasi, belanja, hiburan, tagihan, kesehatan, pendidikan, kos, lainnya
Kategori income: gaji, freelance, kiriman, beasiswa, bonus, jualan, lainnya

Respond dalam JSON format:
{
  "amount": number,
  "type": "income" | "expense",
  "category": string,
  "label": string (deskripsi singkat Bahasa Indonesia),
  "note": string | null
}

Hanya respond JSON, tanpa markdown.`;

    const result = await this.ai.generateText(prompt);
    try {
      const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      return { ...parsed, parsedBy: 'ai' };
    } catch {
      return { raw: result, parsedBy: 'failed' };
    }
  }

  // ── AI: Si Bawel comment ──

  private async generateBawelComment(userId: string, txId: string, dto: CreateTransactionDto) {
    try {
      const setting = await this.prisma.bawelSetting.findUnique({ where: { userId } });
      if (setting && !setting.isEnabled) return;

      const level = setting?.level ?? 'NORMAL';

      // SANTAI mode: skip komentar untuk transaksi < 100K
      if (level === 'SANTAI' && dto.amount < 100000) return;

      // Gather rich context using aggregates
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const catWhere = { userId, category: dto.category, type: dto.type, date: { gte: monthStart } };
      const [categoryAgg, categoryCount, budgets, trees] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: catWhere,
          _sum: { amount: true },
        }),
        this.prisma.transaction.count({ where: catWhere }),
        this.prisma.categoryBudget.findMany({
          where: { userId, month: now.getMonth() + 1, year: now.getFullYear() },
          select: { category: true, amount: true },
        }),
        this.prisma.savingTree.findMany({
          where: { userId },
          select: { currentAmount: true, targetAmount: true },
          take: 1,
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

      const categoryTotal = categoryAgg._sum.amount || 0;
      const catBudget = budgets.find(b => b.category === dto.category);
      const treeProgress = trees[0] ? Math.round((trees[0].currentAmount / trees[0].targetAmount) * 100) : null;

      const prompt = `Kamu adalah "Si Bawel", teman keuangan yang jujur dan sedikit cerewet tapi peduli.
Level kecerewetan: ${level}
- SANTAI: komentar ringan
- NORMAL: komentar biasa, kasih insight
- CEREWET: komentar sangat nyinyir dan detail, cross-reference data lain

Transaksi baru:
- Tipe: ${dto.type}
- Kategori: ${dto.category}
- Jumlah: Rp ${dto.amount.toLocaleString('id-ID')}
- Label: ${dto.label}

Konteks bulan ini:
- Total pengeluaran kategori "${dto.category}": Rp ${categoryTotal.toLocaleString('id-ID')}
- Frekuensi transaksi kategori ini: ${categoryCount}x
${catBudget ? `- Budget kategori ini: Rp ${catBudget.amount.toLocaleString('id-ID')} (${Math.round((categoryTotal / catBudget.amount) * 100)}% terpakai)` : '- Budget kategori: belum diset'}
${treeProgress !== null ? `- Progress pohon tabungan: ${treeProgress}%` : ''}

Rules:
- Jika income: apresiasi + saran sisihkan sebagian
- Jika expense wajar: acknowledge + insight kecil
- Jika expense berulang (>3x): singgung frekuensi dengan humor
- Jika over budget: jujur tapi tidak menghakimi
- Selalu sebut angka nyata, maksimal 2 kalimat
- Bahasa Indonesia casual, boleh pakai "kamu"
- Jangan pakai emoji lebih dari 1

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

  // ── Receipt Scan ──

  private extractJson(text: string): string {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return text.substring(firstBracket, lastBracket + 1);
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1);
    }
    return text.trim();
  }

  async scanReceipt(imageBase64: string, mimeType: string) {
    const prompt = `Kamu adalah OCR parser untuk struk belanja Indonesia.

Dari foto struk ini, ekstrak setiap item transaksi dalam format JSON array:
[
  { "label": "Nasi Goreng", "amount": 25000, "category": "makanan", "type": "expense" },
  { "label": "Es Teh", "amount": 5000, "category": "minuman", "type": "expense" }
]

Catatan:
- Harga dalam Rupiah (angka saja, tanpa "Rp")
- Tentukan kategori: makanan, minuman, belanja, transportasi, hiburan, tagihan, kesehatan, pendidikan, kos, lainnya
- Semua item dari struk adalah expense
- Jika struk tidak terbaca, return { "error": "Struk tidak terbaca" }
- HANYA return JSON, tanpa teks lain`;

    const result = await this.ai.generateText(prompt, {
      imageBase64,
      mimeType,
    });

    try {
      const cleaned = this.extractJson(result);
      return JSON.parse(cleaned);
    } catch {
      return { error: 'Gagal memproses struk', rawResponse: result };
    }
  }

  // ── Budget Alert ──

  /**
   * Check if a category's spending has reached 80% of its budget.
   * If so, trigger a notification via NotificationService.
   */
  private async checkBudgetAlert(userId: string, category: string, txDate: Date) {
    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();

    // Get the budget for this category
    const budget = await this.prisma.categoryBudget.findUnique({
      where: {
        userId_category_month_year: { userId, category, month, year },
      },
    });

    if (!budget) return; // No budget set for this category

    // Calculate total spending in this category for the month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const expenses = await this.prisma.transaction.findMany({
      where: {
        userId,
        category,
        type: 'expense',
        date: { gte: monthStart, lte: monthEnd },
      },
    });

    const totalSpent = expenses.reduce((sum, tx) => sum + tx.amount, 0);
    const utilization = totalSpent / budget.amount;

    // Trigger alert at 80% utilization
    if (utilization >= 0.8) {
      const percentage = Math.round(utilization * 100);
      await this.notificationService.createNotification(
        userId,
        'Budget Alert ⚠️',
        `Pengeluaran kategori "${category}" sudah ${percentage}% dari budget (Rp ${totalSpent.toLocaleString('id-ID')} / Rp ${budget.amount.toLocaleString('id-ID')}).`,
        {
          category: 'keuangan',
          actionUrl: '/duit-tracker?tab=summary',
        },
      );
    }
  }

  // ── Subscription Dismissal ──

  /**
   * Dismiss a detected subscription pattern so it won't be shown again.
   */
  async dismissSubscription(userId: string, pattern: string) {
    return this.prisma.subscriptionDismissal.upsert({
      where: {
        userId_pattern: { userId, pattern },
      },
      update: {},
      create: { userId, pattern },
    });
  }
}
