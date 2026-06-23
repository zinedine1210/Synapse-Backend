import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { UpdateBawelSettingDto } from './dto/update-setting.dto';

// Personality stages — evolves based on interaction count
const PERSONALITY_STAGES = {
  NEWBIE: { minInteractions: 0, trait: 'baru kenal, agak formal tapi tetap nyinyir' },
  KENAL: { minInteractions: 10, trait: 'udah mulai ngerti kebiasaan user, lebih personal' },
  SAHABAT: { minInteractions: 30, trait: 'kayak sahabat sendiri, inget semua kebiasaan, kadang curhat balik' },
  BESTIE: { minInteractions: 75, trait: 'bestie yang tau segalanya, bisa bacain financial behavior user tanpa ditanya' },
};

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
    return setting ?? { userId, level: 'NORMAL', isEnabled: true, memory: null, personalityStage: 'NEWBIE', interactionCount: 0, lastInteraction: null, financialDna: null };
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

  /**
   * Build compact financial context string (token-efficient).
   * Includes: monthly summary, budgets, debts, bills, wishlist, trees
   */
  private async buildFinancialContext(userId: string): Promise<string> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [recentTx, monthSums, categorySums, budgets, trees, debts, bills, wishlist] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        select: { type: true, amount: true, category: true, label: true, date: true },
        orderBy: { date: 'desc' },
        take: 7, // Reduced from 10 for token efficiency
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
        orderBy: { _sum: { amount: 'desc' } },
        take: 5, // Top 5 categories only
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
      // NEW: Debts context
      this.prisma.debt.findMany({
        where: { userId, isPaid: false },
        select: { description: true, amount: true, debtType: true, personName: true, dueDate: true },
        take: 5,
      }),
      // NEW: Recurring bills context
      this.prisma.recurringBill.findMany({
        where: { userId, isActive: true },
        select: { name: true, amount: true, dueDay: true, lastPaidAt: true },
      }),
      // NEW: Wishlist context
      this.prisma.wishlistItem.findMany({
        where: { userId, isPurchased: false },
        select: { name: true, estimatedPrice: true, priority: true },
        orderBy: { priority: 'asc' },
        take: 3,
      }),
    ]);

    const monthIncome = monthSums.find(g => g.type === 'income')?._sum?.amount || 0;
    const monthExpense = monthSums.find(g => g.type === 'expense')?._sum?.amount || 0;

    // Compact budget status
    const byCategory: Record<string, number> = {};
    categorySums.forEach(g => { byCategory[g.category] = g._sum.amount || 0; });
    const budgetLines = budgets.map(b => {
      const spent = byCategory[b.category] ?? 0;
      const pct = Math.round((spent / b.amount) * 100);
      return `${b.category}:${pct}%`;
    }).join(', ');

    // Compact transaction list
    const txLines = recentTx.map(t =>
      `${t.type === 'income' ? '+' : '-'}${t.amount}(${t.category})`
    ).join('; ');

    // Compact debt summary
    const totalDebtOwed = debts.filter(d => d.debtType === 'owed_by_me').reduce((s, d) => s + d.amount, 0);
    const totalDebtLent = debts.filter(d => d.debtType === 'owed_to_me').reduce((s, d) => s + d.amount, 0);
    const overdueDebts = debts.filter(d => d.dueDate && new Date(d.dueDate) < now);

    // Compact bills summary
    const totalBills = bills.reduce((s, b) => s + b.amount, 0);
    const unpaidBills = bills.filter(b => {
      if (!b.lastPaidAt) return true;
      const lastPaid = new Date(b.lastPaidAt);
      return lastPaid.getMonth() < now.getMonth() || lastPaid.getFullYear() < now.getFullYear();
    });

    let ctx = `📊 Bulan ini: +Rp${Number(monthIncome).toLocaleString('id-ID')} / -Rp${Number(monthExpense).toLocaleString('id-ID')} (saldo: Rp${(Number(monthIncome) - Number(monthExpense)).toLocaleString('id-ID')})`;

    if (budgetLines) ctx += `\n📋 Budget: ${budgetLines}`;
    if (txLines) ctx += `\n📝 TX terakhir: ${txLines}`;

    if (trees.length > 0) {
      ctx += `\n🌳 Tabungan: ${trees.map(t => `${t.name} ${Math.round((t.currentAmount / t.targetAmount) * 100)}%`).join(', ')}`;
    }

    if (totalDebtOwed > 0 || totalDebtLent > 0) {
      ctx += `\n💸 Hutang: aku utang Rp${totalDebtOwed.toLocaleString('id-ID')}`;
      if (totalDebtLent > 0) ctx += `, dihutangin Rp${totalDebtLent.toLocaleString('id-ID')}`;
      if (overdueDebts.length > 0) ctx += ` (${overdueDebts.length} jatuh tempo!)`;
    }

    if (bills.length > 0) {
      ctx += `\n🔔 Tagihan rutin: ${bills.length} item, total Rp${totalBills.toLocaleString('id-ID')}/bln`;
      if (unpaidBills.length > 0) ctx += ` (${unpaidBills.length} belum dibayar bulan ini)`;
    }

    if (wishlist.length > 0) {
      ctx += `\n🎯 Wishlist: ${wishlist.map(w => `${w.name}(Rp${w.estimatedPrice.toLocaleString('id-ID')})`).join(', ')}`;
    }

    return ctx;
  }

  /**
   * Get personality prompt fragment based on evolution stage
   */
  private getPersonalityPrompt(setting: any): string {
    const stage = (setting.personalityStage || 'NEWBIE') as keyof typeof PERSONALITY_STAGES;
    const stageInfo = PERSONALITY_STAGES[stage] || PERSONALITY_STAGES.NEWBIE;

    let base = `Kamu "Si Bawel", asisten keuangan virtual yang nyinyir tapi baik hati.
Level kecerewetan: ${setting.level} (SANTAI=supportive, NORMAL=balanced, CEREWET=super nyinyir tapi sayang)
Stage hubungan: ${stage} — ${stageInfo.trait}`;

    // Add memory context if available (compressed facts)
    if (setting.memory) {
      try {
        const memoryData = JSON.parse(setting.memory);
        if (memoryData.facts && memoryData.facts.length > 0) {
          base += `\n🧠 Yang kamu ingat tentang user: ${memoryData.facts.slice(-8).join('; ')}`;
        }
      } catch { /* ignore corrupt memory */ }
    }

    // Add financial DNA if available
    if (setting.financialDna) {
      base += `\n🧬 Profil keuangan user: ${setting.financialDna}`;
    }

    return base;
  }

  /**
   * Extract key facts from conversation and update memory (post-response, non-blocking)
   */
  private async updateMemory(userId: string, userMessage: string, aiReply: string, setting: any): Promise<void> {
    try {
      // Increment interaction count & determine stage evolution
      const newCount = (setting.interactionCount || 0) + 1;
      let newStage = setting.personalityStage || 'NEWBIE';

      if (newCount >= 75) newStage = 'BESTIE';
      else if (newCount >= 30) newStage = 'SAHABAT';
      else if (newCount >= 10) newStage = 'KENAL';

      // Extract a fact from conversation (only every 3rd interaction to save tokens)
      let updatedMemory = setting.memory;
      if (newCount % 3 === 0 && userMessage.length > 15) {
        updatedMemory = await this.extractMemoryFact(userMessage, setting.memory);
      }

      await this.prisma.bawelSetting.upsert({
        where: { userId },
        update: {
          interactionCount: newCount,
          personalityStage: newStage,
          lastInteraction: new Date(),
          ...(updatedMemory !== setting.memory ? { memory: updatedMemory } : {}),
        },
        create: {
          userId,
          level: 'NORMAL',
          isEnabled: true,
          interactionCount: newCount,
          personalityStage: newStage,
          lastInteraction: new Date(),
          memory: updatedMemory,
        },
      });
    } catch (err: any) {
      this.logger.warn(`updateMemory failed: ${err?.message}`);
    }
  }

  /**
   * Extract a key fact from user message and append to memory (max 12 facts, then compress)
   */
  private async extractMemoryFact(userMessage: string, currentMemory: string | null): Promise<string> {
    let facts: string[] = [];
    try {
      if (currentMemory) {
        const parsed = JSON.parse(currentMemory);
        facts = parsed.facts || [];
      }
    } catch { /* start fresh */ }

    // Simple heuristic extraction (no AI call needed — saves tokens!)
    const msg = userMessage.toLowerCase();
    let newFact: string | null = null;

    // Detect patterns in user messages
    if (msg.includes('gaji') || msg.includes('salary')) newFact = `Pernah bahas soal gaji/income`;
    else if (msg.includes('kuliah') || msg.includes('semester')) newFact = `Mahasiswa aktif`;
    else if (msg.includes('kos') || msg.includes('ngekos')) newFact = `Anak kos`;
    else if (msg.includes('nabung') || msg.includes('saving')) newFact = `Lagi berusaha nabung`;
    else if (msg.includes('hemat') || msg.includes('irit')) newFact = `Berusaha hemat`;
    else if (msg.includes('boros') || msg.includes('impulsif')) newFact = `Sadar sering boros`;
    else if (msg.includes('utang') || msg.includes('hutang')) newFact = `Ada concern soal hutang`;
    else if (msg.includes('investasi') || msg.includes('invest')) newFact = `Tertarik investasi`;
    else if (msg.includes('makan') || msg.includes('jajan')) newFact = `Sering bahas pengeluaran makan/jajan`;
    else if (msg.includes('target') || msg.includes('goal')) newFact = `Punya financial goals`;

    if (newFact && !facts.includes(newFact)) {
      facts.push(newFact);
    }

    // Keep max 12 facts (compress oldest if overflow)
    if (facts.length > 12) {
      facts = facts.slice(-12);
    }

    return JSON.stringify({ facts, updatedAt: new Date().toISOString() });
  }

  async chat(userId: string, message: string) {
    const setting = await this.getSetting(userId);

    // Build compact financial context
    const financialCtx = await this.buildFinancialContext(userId);
    const personalityPrompt = this.getPersonalityPrompt(setting);

    const prompt = `${personalityPrompt}

${financialCtx}

User: "${message}"

Jawab bahasa Indonesia casual sesuai level & stage. Sebut angka nyata jika relevan. Max 4-5 kalimat.`;

    const reply = await this.ai.generateText(prompt).catch(() =>
      'Aduh, aku lagi nge-lag nih. Coba tanya lagi nanti ya~ 😅',
    );

    // Update memory in background (non-blocking)
    this.updateMemory(userId, message, reply, setting).catch(() => {});

    return { reply, stage: setting.personalityStage || 'NEWBIE' };
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
      const [typeSums, categorySums, txCount, setting, recentTx, debts, bills] = await Promise.all([
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
          take: 12, // Reduced from 15
        }),
        // NEW: Include debt context in weekly roast
        this.prisma.debt.findMany({
          where: { userId, isPaid: false },
          select: { amount: true, debtType: true, dueDate: true },
        }),
        this.prisma.recurringBill.findMany({
          where: { userId, isActive: true },
          select: { name: true, amount: true, lastPaidAt: true },
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

      // Compact transaction list
      const txList = recentTx.map(t =>
        `- Rp${t.amount.toLocaleString('id-ID')}|${t.category}|"${t.label}"`
      ).join('\n');

      // Debt/bill context for roast
      const totalDebtOwed = debts.filter(d => d.debtType === 'owed_by_me').reduce((s, d) => s + d.amount, 0);
      const now = new Date();
      const unpaidBills = bills.filter(b => {
        if (!b.lastPaidAt) return true;
        const lastPaid = new Date(b.lastPaidAt);
        return lastPaid.getMonth() < now.getMonth() || lastPaid.getFullYear() < now.getFullYear();
      });

      const personalityPrompt = this.getPersonalityPrompt(setting);

      let extraContext = '';
      if (totalDebtOwed > 0) extraContext += `\n⚠️ Total hutang belum lunas: Rp${totalDebtOwed.toLocaleString('id-ID')}`;
      if (unpaidBills.length > 0) extraContext += `\n⚠️ ${unpaidBills.length} tagihan belum dibayar bulan ini`;

      const prompt = `${personalityPrompt}

DATA KEUANGAN MINGGU INI:
- Pemasukan: Rp${Number(income).toLocaleString('id-ID')}
- Pengeluaran: Rp${Number(expense).toLocaleString('id-ID')}
- Saldo: Rp${Number(Number(income) - Number(expense)).toLocaleString('id-ID')}
- Kategori: ${JSON.stringify(byCategory)}
- Jumlah TX: ${txCount}${extraContext}

DETAIL PENGELUARAN:
${txList}

TUGAS: Beri skor 1-10, roast nyinyir, identifikasi 2-4 pengeluaran tidak perlu, 3 nasehat relate anak muda, 1 tips minggu depan.

Format JSON:
{"score":N,"roast":"2-3 kalimat","biggestSpend":"kategori","tip":"tips singkat","unnecessarySpending":[{"item":"nama","amount":N,"reason":"kenapa"}],"advice":["1","2","3"],"savingPotential":N}

Bahasa casual, gaul, tetep supportif.`;

      try {
        const result = await this.ai.generateText(prompt);
        const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (!Array.isArray(parsed.unnecessarySpending)) parsed.unnecessarySpending = [];
        if (!Array.isArray(parsed.advice)) parsed.advice = [];
        if (typeof parsed.savingPotential !== 'number') {
          parsed.savingPotential = parsed.unnecessarySpending.reduce((s: number, item: any) => s + (item.amount || 0), 0);
        }

        // Update memory with roast interaction
        this.updateMemory(userId, '[weekly roast generated]', parsed.roast || '', setting).catch(() => {});

        // Update financial DNA weekly (compact profile)
        this.updateFinancialDna(userId, byCategory, Number(income), Number(expense), totalDebtOwed).catch(() => {});

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
      this.logger.warn(`runWeeklyRoastLogic failed: ${error?.message}`);
      return {
        score: 5,
        roast: 'Gak bisa ngecek data keuanganmu nih. Pastikan udah catat transaksi dulu ya!',
        tip: 'Mulai catat pengeluaran harianmu biar bisa di-roast minggu depan.',
        biggestSpend: '-',
      };
    }
  }

  /**
   * Update financial DNA — a compact text profile of user's financial behavior.
   * Called after weekly roast to keep it fresh without extra AI calls.
   */
  private async updateFinancialDna(
    userId: string,
    categories: Record<string, number>,
    income: number,
    expense: number,
    totalDebt: number,
  ): Promise<void> {
    try {
      const topCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, amt]) => `${cat}(${Math.round((amt / (expense || 1)) * 100)}%)`)
        .join(', ');

      const ratio = expense > 0 && income > 0 ? Math.round((expense / income) * 100) : 0;
      const dna = `Rasio pengeluaran ${ratio}% income. Top spending: ${topCategories}. ${totalDebt > 0 ? `Hutang aktif Rp${totalDebt.toLocaleString('id-ID')}.` : 'Bebas hutang.'} ${ratio > 90 ? 'Cenderung boros.' : ratio < 50 ? 'Cukup hemat.' : 'Moderat.'}`;

      await this.prisma.bawelSetting.upsert({
        where: { userId },
        update: { financialDna: dna },
        create: { userId, level: 'NORMAL', isEnabled: true, financialDna: dna },
      });
    } catch (err: any) {
      this.logger.warn(`updateFinancialDna failed: ${err?.message}`);
    }
  }
}
