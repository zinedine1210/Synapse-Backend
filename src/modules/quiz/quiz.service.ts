import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
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
  ) {}

  async generateQuiz(user: User, dto: GenerateQuizDto) {
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

    return this.aiJob.run(user.id, 'generate_quiz', async () => {
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

    return {
      message: attempt.passed ? '🎉 Lulus!' : 'Belum lulus. Coba lagi!',
      score: attempt.score,
      passed: attempt.passed,
    };
  }
}
