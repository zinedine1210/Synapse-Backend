import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { AiJobService } from '../ai-job/ai-job.service';

@Injectable()
export class BriefingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiUsage: AiUsageService,
    private readonly aiJob: AiJobService,
  ) {}

  async getTodayBriefing(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today's briefing exists
    const todayBriefing = await this.prisma.dailyBriefing.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (todayBriefing) return todayBriefing;

    // Fallback: return the most recent briefing (so it persists across days)
    const latest = await this.prisma.dailyBriefing.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    if (latest) return latest;

    // No briefing at all — generate one for today
    return this.generateBriefing(userId, today);
  }

  /**
   * Selects the top N expense transactions by amount from a list.
   * Exported logic for testability (Property 7).
   */
  static selectTopExpenses(
    transactions: { label: string; amount: number; type: string; category?: string; note?: string | null }[],
    n: number = 3,
  ): { label: string; amount: number; category?: string; note?: string | null }[] {
    return transactions
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, n)
      .map((t) => ({ label: t.label, amount: t.amount, category: t.category, note: t.note }));
  }

  async generateBriefing(userId: string, date: Date) {
    // Check AI usage limit
    await this.aiUsage.checkAndRecord(userId, 'briefing');

    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 24 hours ago for recent expenses
    const last24h = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Day name for matching today's class schedule
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayDayName = dayNames[today.getDay()];

    // Month boundaries for monthly spending
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Gather data
    const [todos, recentExpenses, classMemberships, trees, gamification, profile, monthlyCategorySums, budgets, unpaidBills, activeDebts, activeChallenges, wishlistItems] = await Promise.all([
      // All pending todos with due dates
      this.prisma.personalTodo.findMany({
        where: { userId, status: 'pending' },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // Transactions in last 24 hours for top expenses
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: last24h } },
        select: { label: true, amount: true, type: true, category: true, note: true },
        orderBy: { amount: 'desc' },
        take: 50,
      }),
      // Class memberships with tasks and schedule info
      this.prisma.classMember.findMany({
        where: { userId },
        include: {
          class: {
            include: {
              tasks: {
                where: { deadline: { gte: today, lte: new Date(today.getTime() + 7 * 86400000) } },
                orderBy: { deadline: 'asc' },
                take: 10,
              },
              sessions: {
                orderBy: { sequence: 'asc' },
                take: 1,
                where: { sequence: { gte: 1 } },
              },
            },
          },
        },
      }),
      // Saving trees
      this.prisma.savingTree.findMany({
        where: { userId },
        select: { name: true, currentAmount: true, targetAmount: true },
        take: 5,
      }),
      // Gamification (XP, streak, level)
      this.prisma.userGamification.findUnique({
        where: { userId },
      }),
      // User profile (daily habits, goals)
      this.prisma.userProfile.findUnique({
        where: { userId },
      }),
      // Monthly expense aggregates by category (replaces loading all rows)
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: { userId, type: 'expense', date: { gte: monthStart, lt: monthEnd } },
        _sum: { amount: true },
      }),
      // Category budgets for this month
      this.prisma.categoryBudget.findMany({
        where: { userId, month: today.getMonth() + 1, year: today.getFullYear() },
        select: { category: true, amount: true },
      }),
      // Unpaid recurring bills this month
      this.prisma.recurringBill.findMany({
        where: {
          userId,
          isActive: true,
          OR: [
            { lastPaidFor: null },
            { lastPaidFor: { lt: monthStart } },
          ],
        },
        select: { name: true, amount: true, dueDay: true },
        take: 10,
      }),
      // Active debts
      this.prisma.debt.findMany({
        where: { userId, isPaid: false },
        select: { description: true, amount: true, debtType: true, personName: true, dueDate: true },
        take: 10,
      }),
      // Active budget challenges
      this.prisma.budgetChallenge.findMany({
        where: { userId, isActive: true },
        select: { title: true, currentStreak: true, bestStreak: true, targetAmount: true, completedDays: true, targetDays: true },
        take: 5,
      }),
      // Pending wishlist items
      this.prisma.wishlistItem.findMany({
        where: { userId, isPurchased: false },
        select: { name: true, estimatedPrice: true, priority: true },
        orderBy: { priority: 'asc' },
        take: 5,
      }),
    ]);

    // --- 8.1: Specific task titles with deadlines ---
    const allTasks: { title: string; className: string; deadline: string }[] = [];
    for (const cm of classMemberships) {
      for (const task of cm.class.tasks) {
        allTasks.push({
          title: task.title,
          className: cm.class.name,
          deadline: task.deadline
            ? task.deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })
            : 'tanpa deadline',
        });
      }
    }

    const tasksText = allTasks.length > 0
      ? allTasks.map((t) => `- ${t.title} (${t.className}) — deadline ${t.deadline}`).join('\n')
      : 'Tidak ada tugas mendatang.';

    // --- 8.2: Specific todo titles with due dates ---
    const todosText = todos.length > 0
      ? todos.map((t) => {
          const dueDateStr = t.dueDate
            ? t.dueDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })
            : 'tanpa tanggal';
          return `- ${t.title} — ${dueDateStr}`;
        }).join('\n')
      : 'Tidak ada to-do pending.';

    // --- 8.3: Top 3 expense transactions from last 24 hours ---
    const topExpenses = BriefingService.selectTopExpenses(recentExpenses, 3);
    const expensesText = topExpenses.length > 0
      ? topExpenses.map((t: any) => `- ${t.label} (${t.category || '-'}): Rp${t.amount.toLocaleString('id-ID')}${t.note ? ` — "${t.note}"` : ''}`).join('\n')
      : 'Tidak ada pengeluaran 24 jam terakhir.';

    // --- 8.4: Today's class sessions (classes scheduled today) ---
    const todayClasses: { className: string; sessionTitle: string; time: string; room: string }[] = [];
    for (const cm of classMemberships) {
      const cls = cm.class;
      if (cls.day && cls.day.toLowerCase() === todayDayName.toLowerCase()) {
        // Get the next/current session title if available
        const sessionTitle = cls.sessions.length > 0 ? cls.sessions[0].title : 'Pertemuan';
        todayClasses.push({
          className: cls.name,
          sessionTitle,
          time: cls.time || '-',
          room: cls.room || '-',
        });
      }
    }

    const classScheduleText = todayClasses.length > 0
      ? todayClasses.map((c) => `- ${c.className}: "${c.sessionTitle}" — ${c.time}, Ruang ${c.room}`).join('\n')
      : 'Tidak ada kelas hari ini.';

    // --- 8.5: Saving tree progress (name, percentage) ---
    const treesText = trees.length > 0
      ? trees.map((t) => {
          const pct = t.targetAmount > 0 ? Math.round((t.currentAmount / t.targetAmount) * 100) : 0;
          return `- ${t.name}: ${pct}% (Rp${t.currentAmount.toLocaleString('id-ID')} / Rp${t.targetAmount.toLocaleString('id-ID')})`;
        }).join('\n')
      : '';

    // --- 8.6: Gamification data ---
    const gamifText = gamification
      ? `Level ${gamification.level} | XP: ${gamification.totalXp} | Streak: ${gamification.currentStreak} hari | Longest: ${gamification.longestStreak} hari`
      : 'Belum ada data gamifikasi.';

    // --- 8.7: Monthly spending overview (from aggregates) ---
    const categorySpending: Record<string, number> = {};
    let monthlyTotal = 0;
    for (const g of monthlyCategorySums as any[]) {
      const amt = g._sum.amount || 0;
      categorySpending[g.category] = amt;
      monthlyTotal += amt;
    }
    const topCategories = Object.entries(categorySpending)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `${cat}: Rp${amt.toLocaleString('id-ID')}`)
      .join(', ');

    // Budget utilization
    const budgetText = budgets.length > 0
      ? budgets.map((b) => {
          const spent = categorySpending[b.category] || 0;
          const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
          return `- ${b.category}: ${pct}% terpakai (Rp${spent.toLocaleString('id-ID')} / Rp${b.amount.toLocaleString('id-ID')})`;
        }).join('\n')
      : '';

    // --- 8.8: User profile context ---
    const profileContext = profile
      ? [
          profile.dailyHabits ? `Kebiasaan harian: ${profile.dailyHabits}` : '',
          profile.lifeGoals ? `Tujuan hidup: ${profile.lifeGoals}` : '',
          profile.studySchedule ? `Jadwal belajar: ${profile.studySchedule}` : '',
        ].filter(Boolean).join('\n')
      : '';

    // --- 8.9: Bills / Tagihan due soon ---
    const billsText = unpaidBills.length > 0
      ? unpaidBills.map((b) => {
          const daysUntilDue = b.dueDay - today.getDate();
          const status = daysUntilDue < 0 ? '⚠️ TERLAMBAT' : daysUntilDue <= 3 ? '⏰ SEGERA' : '';
          return `- ${b.name}: Rp${b.amount.toLocaleString('id-ID')} (tgl ${b.dueDay}) ${status}`;
        }).join('\n')
      : '';

    // --- 8.10: Active debts ---
    const debtsOwed = activeDebts.filter(d => d.debtType === 'owed_by_me');
    const debtsLent = activeDebts.filter(d => d.debtType === 'owed_to_me');
    const totalOwed = debtsOwed.reduce((s, d) => s + d.amount, 0);
    const totalLent = debtsLent.reduce((s, d) => s + d.amount, 0);
    const debtsText = activeDebts.length > 0
      ? [
          debtsOwed.length > 0 ? `Hutang kamu: Rp${totalOwed.toLocaleString('id-ID')} (${debtsOwed.length} orang)` : '',
          debtsLent.length > 0 ? `Piutang kamu: Rp${totalLent.toLocaleString('id-ID')} (${debtsLent.length} orang)` : '',
          ...activeDebts.filter(d => d.dueDate && d.dueDate <= new Date(today.getTime() + 7 * 86400000)).map(d => {
            const daysLeft = Math.ceil((d.dueDate!.getTime() - today.getTime()) / 86400000);
            return `- ${d.description} (${d.personName}): Rp${d.amount.toLocaleString('id-ID')} — ${daysLeft <= 0 ? 'JATUH TEMPO!' : `${daysLeft} hari lagi`}`;
          }),
        ].filter(Boolean).join('\n')
      : '';

    // --- 8.11: Active budget challenges ---
    const challengesText = activeChallenges.length > 0
      ? activeChallenges.map(c => `- ${c.title}: streak ${c.currentStreak}🔥 (best: ${c.bestStreak}) — ${c.completedDays}/${c.targetDays} hari${c.targetAmount ? `, target Rp${c.targetAmount.toLocaleString('id-ID')}/hari` : ''}`).join('\n')
      : '';

    // --- 8.12: Wishlist items ---
    const wishlistText = wishlistItems.length > 0
      ? wishlistItems.map(w => `- ${w.name}: Rp${w.estimatedPrice.toLocaleString('id-ID')} (${w.priority === 'high' ? '🔴 prioritas tinggi' : w.priority === 'medium' ? '🟡 sedang' : '⚪ rendah'})`).join('\n')
      : '';

    // Build AI prompt with structured section markers for frontend parsing
    const prompt = `Kamu adalah asisten pribadi cerdas untuk anak muda. Tugasmu bukan sekedar membacakan data, tapi memberikan INSIGHT dan ANALISIS yang benar-benar membantu user mengambil keputusan hari ini.

PRINSIP:
- JANGAN hanya membacakan ulang data. User bisa baca sendiri datanya. Tugasmu adalah MENGANALISIS dan memberikan INSIGHT.
- Hubungkan data satu sama lain: contoh jika pengeluaran makanan tinggi + ada wishlist laptop, beri insight "kalau kurangi jajan Rp50rb/hari, dalam 2 bulan bisa beli laptop yang kamu mau"
- Gunakan catatan/notes dari transaksi untuk memahami KONTEKS pengeluaran sebelum berkomentar
- Prioritaskan yang paling URGENT dan IMPACTFUL, bukan sebutkan semua data

Data hari ini (${today.toLocaleDateString('id-ID')}, ${todayDayName}):

📋 TUGAS KELAS (deadline minggu ini):
${tasksText}

✅ TO-DO PERSONAL:
${todosText}

💸 TOP PENGELUARAN 24 JAM TERAKHIR:
${expensesText}

💰 RINGKASAN KEUANGAN BULAN INI:
Total pengeluaran bulan ini: Rp${monthlyTotal.toLocaleString('id-ID')}
Top kategori: ${topCategories || 'Belum ada data'}
${budgetText ? `\nBudget:\n${budgetText}` : ''}

📚 JADWAL KELAS HARI INI:
${classScheduleText}
${treesText ? `\n🌳 PROGRESS TABUNGAN:\n${treesText}` : ''}
${billsText ? `\n💳 TAGIHAN BULAN INI:\n${billsText}` : ''}
${debtsText ? `\n🤝 HUTANG & PIUTANG:\n${debtsText}` : ''}
${challengesText ? `\n🔥 BUDGET CHALLENGE AKTIF:\n${challengesText}` : ''}
${wishlistText ? `\n🛒 WISHLIST:\n${wishlistText}` : ''}

🎮 GAMIFIKASI:
${gamifText}
${profileContext ? `\n🧠 KONTEKS PERSONAL USER:\n${profileContext}` : ''}

INSTRUKSI FORMAT OUTPUT:
Buat briefing menggunakan section markers berikut agar bisa di-parse oleh frontend. Setiap section HARUS diawali dengan marker yang tepat:

<!-- SECTION:greeting -->
(Sapa user sesuai waktu: pagi/siang/sore. 1-2 kalimat yang PERSONAL dan relevan — bukan sekedar "selamat pagi!" tapi hubungkan dengan konteks hari ini, misal "Pagi! Hari ini ada deadline tugas X, jadi pastiin fokus ya.")

<!-- SECTION:tugas -->
(Rangkum tugas kelas yang mendekati deadline. Sebutkan JUDUL SPESIFIK dan TANGGAL. Berikan strategi singkat: mana yang harus dikerjakan duluan dan kenapa. Jika tidak ada tugas, skip section ini.)

<!-- SECTION:todo -->
(Rangkum to-do personal yang perlu dikerjakan. Prioritaskan yang paling urgent. Jika ada yang sudah overdue, highlight. Jika tidak ada, skip section ini.)

<!-- SECTION:keuangan -->
(ANALISIS, bukan sekedar list. Contoh insight yang bagus:
- "Pengeluaran makanan Rp800rb minggu ini, 60% budget. Kalau lanjut pace ini, budget habis tanggal 20."
- "Beli kursus online Rp200rb — investasi bagus! Pastiin diselesaikan biar worth it."
- "Ngopi 4x minggu ini = Rp120rb. Coba bawa tumbler dari rumah, bisa hemat Rp400rb/bulan."
Pahami KONTEKS dari catatan transaksi sebelum judge. Jika pengeluaran untuk keluarga/pendidikan/kesehatan, apresiasi. Jika tidak ada data, skip.)

<!-- SECTION:tagihan -->
(Sebutkan tagihan yang belum dibayar, terutama yang sudah lewat/mendekati jatuh tempo. Berikan prioritas: mana yang harus dibayar HARI INI. Jika tidak ada, skip.)

<!-- SECTION:hutang -->
(Rangkum total hutang dan piutang. Highlight yang mendekati jatuh tempo. Beri saran spesifik, misal "DM si Andi hari ini buat ingetin utangnya." Jika tidak ada, skip.)

<!-- SECTION:kelas -->
(Sebutkan jadwal kelas hari ini: nama kelas, judul pertemuan, JAM, dan RUANGAN. Jika tidak ada kelas, skip section ini.)

<!-- SECTION:tabungan -->
(Sebutkan nama pohon tabungan dan PERSENTASE progress. Hubungkan dengan keuangan: "kalau sisihkan Rp20rb/hari dari budget jajan, target tercapai dalam X minggu." Jika tidak ada tabungan, skip.)

<!-- SECTION:challenge -->
(Sebutkan challenge aktif, streak saat ini, dan progress. Kasih semangat spesifik untuk jaga streak. Jika tidak ada, skip.)

<!-- SECTION:wishlist -->
(Hubungkan wishlist dengan strategi keuangan: berapa lama bisa tercapai jika hemat dari kategori tertentu. Beri saran realistis. Jika tidak ada, skip.)

<!-- SECTION:motivasi -->
(1 kalimat motivasi yang SPESIFIK dan relevan dengan data user hari ini — bukan quotes generik. Contoh: "Streak 5 hari jaga budget, tinggal 2 hari lagi buat pecah rekor! 🔥")

ATURAN:
- Bahasa Indonesia, casual tapi BERISI
- Berikan INSIGHT dan ANALISIS, bukan sekedar membacakan data
- Hubungkan antar-data untuk menemukan pola dan saran yang actionable
- Max 400 kata total
- JANGAN tambahkan section yang tidak ada datanya
- Format konten di dalam setiap section sebagai markdown (bold, list, dll)`;

    let content: string;
    try {
      content = await this.ai.generateText(prompt);
    } catch {
      content = '<!-- SECTION:motivasi -->\nMaaf, AI briefing sedang tidak tersedia. Coba lagi nanti ya~ 🙏';
    }

    // Save to cache
    const briefing = await this.prisma.dailyBriefing.upsert({
      where: { userId_date: { userId, date: today } },
      update: { content },
      create: { userId, date: today, content },
    });

    return briefing;
  }

  async getHistory(userId: string, limit: number = 7) {
    return this.prisma.dailyBriefing.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async refreshBriefing(userId: string) {
    return this.aiJob.runAsync(userId, 'briefing_refresh', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Delete existing
    await this.prisma.dailyBriefing.deleteMany({
      where: { userId, date: today },
    });

    return this.generateBriefing(userId, today);
    }); // end aiJob.run
  }
}
