import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { NotificationService } from '../notification/notification.service';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { AttemptQuizDto } from './dto/attempt-quiz.dto';
import { User } from '@prisma/client';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly aiJob: AiJobService,
    private readonly aiUsage: AiUsageService,
    private readonly notificationService: NotificationService,
  ) {}

  async generateQuiz(user: User, dto: GenerateQuizDto) {
    await this.aiUsage.checkAndRecord(user.id, 'quiz_generate');
    // Verify user is a member of the class that owns these sessions
    const sessions = await this.prisma.session.findMany({
      where: { id: { in: dto.sessionIds } },
      select: { classId: true },
    });
    const classIds = [...new Set(sessions.map(s => s.classId))];
    for (const classId of classIds) {
      const member = await this.prisma.classMember.findUnique({
        where: { classId_userId: { classId, userId: user.id } },
      });
      if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    }

    // Kumpulkan semua AI summary dari sesi yang dipilih
    const materials = await this.prisma.material.findMany({
      where: {
        sessionId: { in: dto.sessionIds },
        status: 'SUCCESS',
        aiSummary: { not: null },
      },
    });

    const combinedSummary = materials
      .map((m) => m.aiSummary)
      .join('\n\n---\n\n');

    if (!combinedSummary.trim()) {
      return {
        message: 'Tidak ada materi yang sudah diproses AI untuk sesi yang dipilih.',
        quizzes: [],
      };
    }

    return this.aiJob.runAsync(user.id, 'generate_quiz', async () => {
    const questionsJson = await this.aiService.generateQuizQuestions(
      combinedSummary,
      dto.count ?? 10,
    );

    // Simpan soal ke database
    const questions: Array<{
      question: string;
      answerKey: string;
      explanation?: string;
    }> = JSON.parse(questionsJson);

    // Gunakan sessionId pertama sebagai referensi
    const targetSessionId = dto.sessionIds[0];

    const createdQuizzes = await this.prisma.$transaction(
      questions.map((q) =>
        this.prisma.quiz.create({
          data: {
            sessionId: targetSessionId,
            question: JSON.stringify(q),
            answerKey: q.answerKey,
            explanation: q.explanation,
          },
        }),
      ),
    );

    this.logger.log(`${createdQuizzes.length} soal kuis dibuat untuk user ${user.id}`);

    return {
      message: `${createdQuizzes.length} soal berhasil dibuat!`,
      quizzes: questions,
      quizIds: createdQuizzes.map((q) => q.id),
    };
    }); // end aiJob.run
  }

  async submitAttempt(userId: string, dto: AttemptQuizDto) {
    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId: dto.quizId,
        userId,
        score: dto.score,
        passed: dto.score >= 70,
        answers: dto.answers ? JSON.stringify(dto.answers) : undefined,
      },
    });

    // Send notification for quiz result
    const emoji = attempt.passed ? '🎉' : '💪';
    const msg = attempt.passed
      ? `Selamat! Kamu lulus quiz dengan skor ${attempt.score}%. Mantap!`
      : `Skor quiz kamu ${attempt.score}%. Jangan menyerah, coba lagi!`;
    this.notificationService.createNotification(
      userId,
      `${emoji} Hasil Quiz`,
      msg,
      { category: 'kelas', actionUrl: '/quiz' },
    ).catch(() => {});

    return {
      message: attempt.passed ? '🎉 Lulus!' : 'Belum lulus. Coba lagi!',
      score: attempt.score,
      passed: attempt.passed,
    };
  }

  /** Get all quiz attempts for a session (leaderboard / history) */
  async getSessionAttempts(sessionId: string, userId: string) {
    // Verify user is a member of the class that owns this session
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { classId: true },
    });
    if (!session) return [];
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: session.classId, userId } },
    });
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        quiz: { sessionId },
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return attempts.map(a => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.fullName,
      userAvatar: a.user.avatarUrl,
      score: a.score,
      passed: a.passed,
      createdAt: a.createdAt,
    }));
  }
}
