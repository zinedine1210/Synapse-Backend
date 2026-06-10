import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class BriefingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async getTodayBriefing(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check cache
    const existing = await this.prisma.dailyBriefing.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (existing) return existing;

    // Generate new briefing
    return this.generateBriefing(userId, today);
  }

  async generateBriefing(userId: string, date: Date) {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Gather data
    const [todos, recentTx, upcomingDeadlines, classMemberships, trees] = await Promise.all([
      this.prisma.personalTodo.findMany({
        where: { userId, status: 'pending' },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: new Date(today.getTime() - 7 * 86400000) } },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.prisma.personalTodo.findMany({
        where: {
          userId,
          status: 'pending',
          dueDate: { gte: today, lte: new Date(today.getTime() + 3 * 86400000) },
        },
      }),
      this.prisma.classMember.findMany({
        where: { userId },
        include: {
          class: {
            include: {
              tasks: {
                where: { deadline: { gte: today, lte: new Date(today.getTime() + 7 * 86400000) } },
                orderBy: { deadline: 'asc' },
                take: 5,
              },
              forumPosts: {
                where: { createdAt: { gte: new Date(today.getTime() - 2 * 86400000) } },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { author: { select: { fullName: true } } },
              },
            },
          },
        },
      }),
      this.prisma.savingTree.findMany({
        where: { userId },
        take: 5,
      }),
    ]);

    const weekIncome = recentTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const weekExpense = recentTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const todosText = todos.length > 0
      ? todos.map(t => `- ${t.title} (prioritas: ${t.priority}${t.dueDate ? `, deadline: ${t.dueDate.toLocaleDateString('id-ID')}` : ''})`).join('\n')
      : 'Tidak ada to-do pending.';

    const deadlinesText = upcomingDeadlines.length > 0
      ? upcomingDeadlines.map(t => `- ${t.title} (${t.dueDate?.toLocaleDateString('id-ID')})`).join('\n')
      : 'Tidak ada deadline dekat.';

    // Class tasks & forum
    let classText = '';
    for (const cm of classMemberships) {
      const cls = cm.class;
      const classTasks = cls.tasks;
      const classForum = cls.forumPosts;
      if (classTasks.length > 0 || classForum.length > 0) {
        classText += `\n📚 Kelas: ${cls.name}\n`;
        if (classTasks.length > 0) {
          classText += 'Tugas:\n' + classTasks.map((t: any) => `- ${t.title} (deadline: ${t.deadline?.toLocaleDateString('id-ID')})`).join('\n') + '\n';
        }
        if (classForum.length > 0) {
          classText += `Diskusi baru: ${classForum.length} post terbaru\n`;
        }
      }
    }

    // Saving trees
    const treesText = trees.length > 0
      ? trees.map(t => {
          const pct = t.targetAmount > 0 ? Math.round((t.currentAmount / t.targetAmount) * 100) : 0;
          return `- ${t.name}: Rp${t.currentAmount.toLocaleString('id-ID')} / Rp${t.targetAmount.toLocaleString('id-ID')} (${pct}%)`;
        }).join('\n')
      : '';

    const prompt = `Kamu adalah asisten pribadi yang ramah. Buat briefing harian singkat untuk mahasiswa.

Data hari ini (${today.toLocaleDateString('id-ID')}):

📋 To-Do Pending:
${todosText}

⏰ Deadline 3 Hari Kedepan:
${deadlinesText}

💰 Keuangan 7 Hari Terakhir:
- Pemasukan: Rp${weekIncome.toLocaleString('id-ID')}
- Pengeluaran: Rp${weekExpense.toLocaleString('id-ID')}
- Saldo: Rp${(weekIncome - weekExpense).toLocaleString('id-ID')}
${classText ? `\n📚 KELAS:\n${classText}` : ''}${treesText ? `\n🌳 Tabungan:\n${treesText}` : ''}

Buat briefing harian yang:
1. Sapa user (sesuaikan dengan waktu: pagi/siang/sore)
2. Rangkum to-do yang harus dikerjakan hari ini
3. Ingatkan deadline yang dekat (termasuk tugas kelas)
4. Kasih insight singkat soal keuangan jika ada yang perlu diperhatikan
5. Jika ada progress tabungan, kasih semangat
6. Tutup dengan motivasi singkat

Format: Markdown, bahasa Indonesia, casual tapi informatif. Max 300 kata.`;

    const content = await this.ai.generateText(prompt);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Delete existing
    await this.prisma.dailyBriefing.deleteMany({
      where: { userId, date: today },
    });

    return this.generateBriefing(userId, today);
  }
}
