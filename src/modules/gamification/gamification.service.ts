import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// XP Rewards table from spec
const XP_REWARDS: Record<string, number> = {
  transaction: 5,
  scan: 15,
  todo_complete: 5,
  todo_ontime: 10,
  qna_question: 5,
  qna_answer: 10,
  qna_approved: 30,
  upload_material: 15,
  quiz_pass: 20,
  budget_month_ok: 100,
  streak_7: 30,
  streak_30: 100,
  budget_challenge: 50,
  share_achievement: 10,
  tree_25: 25,
  tree_50: 50,
  tree_75: 75,
  tree_100: 100,
};

// Level thresholds
const LEVELS = [
  { level: 1, name: 'Mahasiswa Baru', minXp: 0 },
  { level: 2, name: 'Mulai Rajin', minXp: 100 },
  { level: 3, name: 'Konsisten', minXp: 300 },
  { level: 4, name: 'Produktif', minXp: 600 },
  { level: 5, name: 'Overachiever', minXp: 1000 },
  { level: 6, name: 'Synapse Pro', minXp: 1500 },
  { level: 7, name: 'Legenda Kampus', minXp: 2500 },
];

// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'first_transaction', name: 'Pencatat Pertama', description: 'Catat transaksi pertama', icon: '🏅' },
  { id: 'budget_master', name: 'Budget Master', description: '1 bulan penuh budget tidak over', icon: '🏅' },
  { id: 'streak_7', name: 'Si Rajin', description: '7 hari streak', icon: '🏅' },
  { id: 'qna_gold', name: 'Jawaban Emas', description: '5 jawaban Q&A di-approve', icon: '🏅' },
  { id: 'tree_complete', name: 'Hemat Sultan', description: 'Saving tree pertama tercapai 100%', icon: '🏅' },
  { id: 'todo_20_week', name: 'Produktif Parah', description: '20 todo selesai dalam 1 minggu', icon: '🏅' },
  { id: 'scan_10', name: 'Tukang Scan', description: '10 struk di-scan', icon: '🏅' },
  { id: 'streak_30', name: 'Semester Warrior', description: 'Login streak 30 hari', icon: '🏅' },
  { id: 'level_7', name: 'Synapse Legend', description: 'Reach Level 7', icon: '🏅' },
  { id: 'challenge_5', name: 'Tantangan Master', description: '5 budget challenge selesai', icon: '🏅' },
  { id: 'share_3', name: 'Social Butterfly', description: 'Share 3 achievement ke socmed', icon: '🏅' },
];

function calculateLevel(totalXp: number): number {
  let level = 1;
  for (const l of LEVELS) {
    if (totalXp >= l.minXp) level = l.level;
  }
  return level;
}

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    let profile = await this.prisma.userGamification.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.userGamification.create({
        data: { userId },
      });
    }

    const levelInfo = LEVELS.find((l) => l.level === profile.level) || LEVELS[0];
    const nextLevel = LEVELS.find((l) => l.level === profile.level + 1);

    return {
      ...profile,
      levelName: levelInfo.name,
      nextLevelXp: nextLevel?.minXp ?? null,
      nextLevelName: nextLevel?.name ?? null,
      xpProgress: nextLevel
        ? ((profile.totalXp - levelInfo.minXp) / (nextLevel.minXp - levelInfo.minXp)) * 100
        : 100,
      achievementDetails: ACHIEVEMENTS.filter((a) =>
        profile.achievements.includes(a.id),
      ),
      allAchievements: ACHIEVEMENTS.map((a) => ({
        ...a,
        unlocked: profile.achievements.includes(a.id),
      })),
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.xpTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.xpTransaction.count({ where: { userId } }),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getLeaderboard(classId: string) {
    // Get all members of the class
    const memberships = await this.prisma.classMember.findMany({
      where: { classId },
      select: { userId: true, user: { select: { fullName: true } } },
    });

    const userIds = memberships.map((m: any) => m.userId);

    const gamifications = await this.prisma.userGamification.findMany({
      where: { userId: { in: userIds } },
      orderBy: { totalXp: 'desc' },
    });

    return gamifications.map((g, index) => {
      const member = memberships.find((m: any) => m.userId === g.userId);
      return {
        rank: index + 1,
        userId: g.userId,
        name: member?.user?.fullName || 'Unknown',
        totalXp: g.totalXp,
        level: g.level,
        levelName: LEVELS.find((l) => l.level === g.level)?.name || 'Mahasiswa Baru',
        currentStreak: g.currentStreak,
      };
    });
  }

  async checkStreak(userId: string) {
    let profile = await this.prisma.userGamification.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.userGamification.create({
        data: { userId },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActive = profile.lastActiveDate
      ? new Date(profile.lastActiveDate)
      : null;

    if (lastActive) {
      lastActive.setHours(0, 0, 0, 0);
    }

    const todayMs = today.getTime();
    const lastMs = lastActive?.getTime() ?? 0;
    const diffDays = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));

    let newStreak = profile.currentStreak;
    let streakBroken = false;
    const newAchievements: string[] = [];
    let xpEarned = 0;

    if (diffDays === 0) {
      // Already checked in today
      return {
        streak: profile.currentStreak,
        alreadyChecked: true,
        xpEarned: 0,
        newAchievements: [],
      };
    } else if (diffDays === 1) {
      // Consecutive day
      newStreak = profile.currentStreak + 1;
    } else {
      // Streak broken
      streakBroken = true;
      newStreak = 1;
    }

    const longestStreak = Math.max(profile.longestStreak, newStreak);

    // Check streak achievements and XP
    if (newStreak === 7 && !profile.achievements.includes('streak_7')) {
      newAchievements.push('streak_7');
      xpEarned += XP_REWARDS.streak_7;
    }
    if (newStreak === 30 && !profile.achievements.includes('streak_30')) {
      newAchievements.push('streak_30');
      xpEarned += XP_REWARDS.streak_30;
    }

    const newTotalXp = profile.totalXp + xpEarned;
    const newLevel = calculateLevel(newTotalXp);

    // Check level 7 achievement
    if (newLevel === 7 && !profile.achievements.includes('level_7')) {
      newAchievements.push('level_7');
    }

    const allAchievements = [...profile.achievements, ...newAchievements];

    await this.prisma.$transaction([
      this.prisma.userGamification.update({
        where: { userId },
        data: {
          currentStreak: newStreak,
          longestStreak,
          lastActiveDate: today,
          totalXp: newTotalXp,
          level: newLevel,
          achievements: allAchievements,
        },
      }),
      ...(xpEarned > 0
        ? [
            this.prisma.xpTransaction.create({
              data: {
                userId,
                amount: xpEarned,
                source: 'streak',
                description:
                  newStreak === 30
                    ? `🔥 Streak 30 hari!`
                    : `🔥 Streak 7 hari!`,
              },
            }),
          ]
        : []),
    ]);

    return {
      streak: newStreak,
      longestStreak,
      streakBroken,
      previousStreak: streakBroken ? profile.currentStreak : undefined,
      xpEarned,
      newAchievements: ACHIEVEMENTS.filter((a) =>
        newAchievements.includes(a.id),
      ),
      totalXp: newTotalXp,
      level: newLevel,
      levelName: LEVELS.find((l) => l.level === newLevel)?.name,
    };
  }

  /**
   * Award XP from other modules (called externally)
   */
  async awardXp(userId: string, source: string, description?: string) {
    const amount = XP_REWARDS[source] ?? 0;
    if (amount === 0) return;

    let profile = await this.prisma.userGamification.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.userGamification.create({
        data: { userId },
      });
    }

    const newTotalXp = profile.totalXp + amount;
    const newLevel = calculateLevel(newTotalXp);
    const newAchievements: string[] = [];

    // Check for level 7 achievement
    if (newLevel === 7 && !profile.achievements.includes('level_7')) {
      newAchievements.push('level_7');
    }

    await this.prisma.$transaction([
      this.prisma.userGamification.update({
        where: { userId },
        data: {
          totalXp: newTotalXp,
          level: newLevel,
          achievements: [...profile.achievements, ...newAchievements],
        },
      }),
      this.prisma.xpTransaction.create({
        data: { userId, amount, source, description },
      }),
    ]);

    return { xpEarned: amount, totalXp: newTotalXp, level: newLevel };
  }
}
