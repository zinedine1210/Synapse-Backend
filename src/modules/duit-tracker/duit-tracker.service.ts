import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
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

// Debt keywords
const DEBT_KEYWORDS = ['hutang', 'utang', 'pinjam', 'pinjem', 'ngutang', 'minjem', 'piutang'];
const DEBT_TO_ME_KEYWORDS = ['piutang', 'ngasih pinjam', 'dipinjem', 'diutang'];

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

const MONTH_MAP: Record<string, number> = {
  'jan': 0, 'januari': 0, 'january': 0,
  'feb': 1, 'februari': 1, 'february': 1,
  'mar': 2, 'maret': 2, 'march': 2,
  'apr': 3, 'april': 3,
  'mei': 4, 'may': 4,
  'jun': 5, 'juni': 5, 'june': 5,
  'jul': 6, 'juli': 6, 'july': 6,
  'agu': 7, 'agus': 7, 'agustus': 7, 'august': 7,
  'sep': 8, 'sept': 8, 'september': 8,
  'okt': 9, 'oktober': 9, 'october': 9,
  'nov': 10, 'november': 10,
  'des': 11, 'desember': 11, 'december': 11,
};

function parseDateFromText(text: string): string | null {
  const lower = text.toLowerCase();
  const now = new Date();

  // "kemarin" / "yesterday"
  if (/\bkemarin\b|\byesterday\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  // "hari ini" / "today"
  if (/\bhari ini\b|\btoday\b/.test(lower)) {
    return now.toISOString().split('T')[0];
  }

  // "2 hari lalu" / "3 hari yang lalu"
  const daysAgoMatch = lower.match(/(\d+)\s*hari\s*(lalu|yang lalu)/);
  if (daysAgoMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1]));
    return d.toISOString().split('T')[0];
  }

  // "tanggal 11 juni" / "tgl 11 juni" / "11 juni" / "11 jun"
  const dateMonthMatch = lower.match(/(?:tanggal|tgl|tg)?\s*(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)/);
  if (dateMonthMatch) {
    const day = parseInt(dateMonthMatch[1]);
    const monthKey = dateMonthMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey] ?? MONTH_MAP[monthKey.slice(0, 3)];
    if (month !== undefined) {
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      const d = new Date(year, month, day);
      return d.toISOString().split('T')[0];
    }
  }

  // "11/6" / "11-6" (dd/mm)
  const slashMatch = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1]);
    const month = parseInt(slashMatch[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      const d = new Date(year, month, day);
      return d.toISOString().split('T')[0];
    }
  }

  return null;
}

function parsePersonName(text: string): string | null {
  const lower = text.toLowerCase();
  // "hutang ke budi 50k" → "budi"
  // "pinjem dari andi 100k" → "andi"
  const patterns = [
    /(?:hutang|utang|pinjam|pinjem|ngutang|minjem)\s+(?:ke|sama|dari|ama)\s+(\w+)/i,
    /(?:piutang|dipinjem|diutang)\s+(?:oleh|dari|sama|ama)?\s*(\w+)/i,
    /(\w+)\s+(?:hutang|utang|ngutang|minjem|pinjam|pinjem)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Skip amount-like words and common keywords
      if (/^\d/.test(name) || ['ke', 'dari', 'sama', 'ama', 'untuk', 'buat'].includes(name.toLowerCase())) continue;
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  }
  return null;
}

interface ParseResult {
  amount: number;
  type: string;
  category: string;
  label: string;
  date?: string;
  isDebt?: boolean;
  debtType?: string;
  personName?: string;
}

function ruleBasedParse(text: string): ParseResult | null {
  const amount = parseAmountFromText(text);
  if (!amount) return null;

  const lower = text.toLowerCase();
  const date = parseDateFromText(text) || undefined;

  // Check debt keywords first
  if (DEBT_KEYWORDS.some(kw => lower.includes(kw))) {
    const isToMe = DEBT_TO_ME_KEYWORDS.some(kw => lower.includes(kw));
    const personName = parsePersonName(text);
    const label = text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text;
    return {
      amount,
      type: isToMe ? 'income' : 'expense',
      category: 'hutang',
      label,
      date,
      isDebt: true,
      debtType: isToMe ? 'owed_to_me' : 'owed_by_me',
      personName: personName || undefined,
    };
  }

  // Check income keywords
  for (const [cat, keywords] of Object.entries(INCOME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return { amount, type: 'income', category: cat, label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text, date };
    }
  }

  // Check expense keywords
  for (const [cat, keywords] of Object.entries(EXPENSE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return { amount, type: 'expense', category: cat, label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text, date };
    }
  }

  // Default: has amount but no keyword match
  return { amount, type: 'expense', category: 'lainnya', label: text.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta|m)?\s*/gi, '').trim() || text, date };
}

@Injectable()
export class DuitTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
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
    return this.aiJob.run(userId, 'generate_comment', async () => {
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
    }); // end aiJob.run
  }

  async getTransactions(userId: string, query: { month?: number; year?: number; category?: string; type?: string; startDate?: string; endDate?: string }) {
    const where: any = { userId };

    if (query.startDate && query.endDate) {
      // Date range takes priority over month/year
      where.date = { gte: new Date(query.startDate), lte: new Date(query.endDate + 'T23:59:59.999Z') };
    } else if (query.month && query.year) {
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
    return this.aiJob.run(userId, 'parse_transaction', async () => {
    const prompt = `Kamu adalah asisten keuangan. Parse input berikut menjadi transaksi keuangan ATAU hutang.
Input: "${text}"
Hari ini: ${new Date().toISOString().split('T')[0]}

Kategori expense: makanan, minuman, transportasi, belanja, hiburan, tagihan, kesehatan, pendidikan, kos, hutang, lainnya
Kategori income: gaji, freelance, kiriman, beasiswa, bonus, jualan, lainnya

Jika input menyebut hutang/utang/pinjam/pinjem/ngutang, set isDebt=true.
- "hutang ke X" / "pinjam dari X" → debtType: "owed_by_me"
- "piutang dari X" / "X hutang ke saya" → debtType: "owed_to_me"

Respond dalam JSON format:
{
  "amount": number,
  "type": "income" | "expense",
  "category": string,
  "label": string (deskripsi singkat Bahasa Indonesia),
  "note": string | null,
  "date": string | null (format YYYY-MM-DD, null jika tidak disebutkan),
  "isDebt": boolean (true jika ini hutang/piutang),
  "debtType": "owed_by_me" | "owed_to_me" | null,
  "personName": string | null (nama orang yang terkait hutang)
}

Hanya respond JSON, tanpa markdown.`;

    let result: string;
    try {
      result = await this.ai.generateText(prompt);
    } catch {
      return { parsedBy: 'failed', error: 'AI tidak tersedia saat ini' };
    }
    try {
      const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      return { ...parsed, parsedBy: 'ai' };
    } catch {
      return { raw: result, parsedBy: 'failed' };
    }
    }); // end aiJob.run
  }

  // ── AI: Si Bawel comment ──

  private async generateBawelComment(userId: string, txId: string, dto: CreateTransactionDto) {
    try {
      const setting = await this.prisma.bawelSetting.findUnique({ where: { userId } });
      if (setting && !setting.isEnabled) return;

      const level = setting?.level ?? 'NORMAL';

      // SANTAI mode: skip komentar untuk transaksi < 100K
      if (level === 'SANTAI' && dto.amount < 100000) return;

      // Gather rich context
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [categoryTxs, budgets, trees] = await Promise.all([
        this.prisma.transaction.findMany({
          where: { userId, category: dto.category, date: { gte: monthStart } },
        }),
        this.prisma.categoryBudget.findMany({
          where: { userId, month: now.getMonth() + 1, year: now.getFullYear() },
        }),
        this.prisma.savingTree.findMany({ where: { userId }, take: 1, orderBy: { updatedAt: 'desc' } }),
      ]);

      const categoryTotal = categoryTxs.filter(t => t.type === dto.type).reduce((s, t) => s + t.amount, 0);
      const categoryCount = categoryTxs.filter(t => t.type === dto.type).length;
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

  async scanReceipt(userId: string, imageBase64: string, mimeType: string) {
    return this.aiJob.runAsync(userId, 'scan_receipt', async () => {
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

    let result: string;
    try {
      result = await this.ai.generateText(prompt, {
        imageBase64,
        mimeType,
      });
    } catch {
      return { error: 'AI tidak tersedia saat ini. Coba lagi nanti.' };
    }

    try {
      const cleaned = this.extractJson(result);
      return JSON.parse(cleaned);
    } catch {
      return { error: 'Gagal memproses struk', rawResponse: result };
    }
    }); // end aiJob.run
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

  // ── Debt/Hutang ──

  async getDebts(userId: string, isPaid?: boolean) {
    const where: any = { userId };
    if (isPaid !== undefined) where.isPaid = isPaid;
    return this.prisma.debt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDebt(userId: string, dto: { description: string; amount: number; debtType: string; personName: string; dueDate?: string }) {
    return this.prisma.debt.create({
      data: {
        userId,
        description: dto.description,
        amount: dto.amount,
        debtType: dto.debtType,
        personName: dto.personName,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
  }

  async updateDebt(userId: string, debtId: string, dto: { description?: string; amount?: number; debtType?: string; personName?: string; dueDate?: string }) {
    const debt = await this.prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new NotFoundException('Hutang tidak ditemukan');
    return this.prisma.debt.update({
      where: { id: debtId },
      data: {
        ...(dto.description && { description: dto.description }),
        ...(dto.amount && { amount: dto.amount }),
        ...(dto.debtType && { debtType: dto.debtType }),
        ...(dto.personName && { personName: dto.personName }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
      },
    });
  }

  async deleteDebt(userId: string, debtId: string) {
    const debt = await this.prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new NotFoundException('Hutang tidak ditemukan');
    return this.prisma.debt.delete({ where: { id: debtId } });
  }

  async markDebtPaid(userId: string, debtId: string) {
    const debt = await this.prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new NotFoundException('Hutang tidak ditemukan');
    if (debt.isPaid) throw new BadRequestException('Hutang sudah lunas');

    // Create a transaction for the debt payment
    const type = debt.debtType === 'owed_by_me' ? 'expense' : 'income';
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        amount: debt.amount,
        type,
        category: 'hutang',
        label: `Bayar hutang: ${debt.description} (${debt.personName})`,
        note: `Pelunasan hutang`,
        date: new Date(),
      },
    });

    await this.prisma.debt.update({
      where: { id: debtId },
      data: { isPaid: true, paidAt: new Date(), linkedTransactionId: tx.id },
    });

    return { debt: { ...debt, isPaid: true, paidAt: new Date(), linkedTransactionId: tx.id }, transaction: tx };
  }
}
