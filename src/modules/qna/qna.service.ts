import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationService } from '../notification/notification.service';
import { CreateQuestionDto, CreateAnswerDto, UpdateQuestionDto } from './dto/qna.dto';

@Injectable()
export class QnaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly notificationService: NotificationService,
  ) {}

  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 80) +
      '-' +
      Date.now().toString(36)
    );
  }

  async createQuestion(userId: string, dto: CreateQuestionDto) {
    const slug = this.generateSlug(dto.title);

    const question = await this.prisma.qnaQuestion.create({
      data: {
        userId,
        title: dto.title,
        body: dto.body,
        category: dto.category ?? [],
        tags: dto.tags ?? [],
        slug,
        isPublic: dto.isPublic ?? true,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Update reputation
    await this.prisma.userReputation.upsert({
      where: { userId },
      update: { questionsAsked: { increment: 1 }, score: { increment: 1 } },
      create: { userId, questionsAsked: 1, score: 1 },
    });

    // Award XP: +5 for asking a question
    await this.gamificationService.awardXp(userId, 'qna_question', `Bertanya: ${dto.title}`);

    return question;
  }

  async getQuestions(query: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: any = { isPublic: true };

    if (query.category) where.category = { has: query.category };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { body: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [questions, total] = await Promise.all([
      this.prisma.qnaQuestion.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { answers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.qnaQuestion.count({ where }),
    ]);

    return {
      questions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlug(slug: string) {
    const question = await this.prisma.qnaQuestion.findUnique({
      where: { slug },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        answers: {
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
          orderBy: [
            { isApprovedByAsker: 'desc' },
            { upvotes: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');

    // Fetch related questions (max 5, sharing at least one category or tag)
    const relatedQuestions = await this.getRelatedQuestions(
      question.id,
      question.category,
      question.tags,
    );

    return { ...question, relatedQuestions };
  }

  /**
   * Find up to 5 related questions sharing at least one category or tag,
   * excluding the source question itself.
   */
  async getRelatedQuestions(
    questionId: string,
    categories: string[],
    tags: string[],
  ) {
    if (categories.length === 0 && tags.length === 0) {
      return [];
    }

    const orConditions: any[] = [];
    if (categories.length > 0) {
      orConditions.push({ category: { hasSome: categories } });
    }
    if (tags.length > 0) {
      orConditions.push({ tags: { hasSome: tags } });
    }

    return this.prisma.qnaQuestion.findMany({
      where: {
        id: { not: questionId },
        isPublic: true,
        OR: orConditions,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        tags: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { answers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  /**
   * Increment view count for a question (no auth required).
   */
  async incrementViewCount(questionId: string) {
    const question = await this.prisma.qnaQuestion.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');

    await this.prisma.qnaQuestion.update({
      where: { id: questionId },
      data: { viewCount: { increment: 1 } },
    });

    return { viewCount: question.viewCount + 1 };
  }

  async getMyQuestions(userId: string, page = 1, limit = 10) {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.qnaQuestion.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { answers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.qnaQuestion.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createAnswer(
    userId: string,
    questionId: string,
    dto: CreateAnswerDto,
  ) {
    const question = await this.prisma.qnaQuestion.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');

    const answer = await this.prisma.qnaAnswer.create({
      data: {
        questionId,
        userId,
        body: dto.body,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Update question status
    if (question.status === 'open') {
      await this.prisma.qnaQuestion.update({
        where: { id: questionId },
        data: { status: 'answered' },
      });
    }

    // Award XP: +10 for answering a question
    await this.gamificationService.awardXp(userId, 'qna_answer', `Menjawab pertanyaan`);

    // Notify question owner that their question received an answer (Requirement 20.3)
    if (question.userId !== userId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: question.userId },
      });
      if (!pref || pref.qnaAnswer !== false) {
        const answerer = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { fullName: true },
        });
        await this.notificationService.createNotification(
          question.userId,
          '💬 Jawaban baru!',
          `${answerer?.fullName ?? 'Seseorang'} menjawab pertanyaanmu "${question.title}"`,
          { category: 'qna', actionUrl: `/qna/${question.slug}` },
        );
      }
    }

    return answer;
  }

  async approveAnswer(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({
      where: { id: answerId },
      include: { question: true },
    });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.question.userId !== userId)
      throw new ForbiddenException(
        'Hanya pemilik pertanyaan yang bisa approve.',
      );

    // Reset other approvals for this question
    await this.prisma.qnaAnswer.updateMany({
      where: { questionId: answer.questionId, isApprovedByAsker: true },
      data: { isApprovedByAsker: false },
    });

    const updated = await this.prisma.qnaAnswer.update({
      where: { id: answerId },
      data: { isApprovedByAsker: true },
    });

    // Update answerer reputation
    await this.prisma.userReputation.upsert({
      where: { userId: answer.userId },
      update: { answersApproved: { increment: 1 }, score: { increment: 5 } },
      create: { userId: answer.userId, answersApproved: 1, score: 5 },
    });

    // Award XP: +30 for having an answer approved
    await this.gamificationService.awardXp(answer.userId, 'qna_approved', `Jawaban di-approve`);

    // Notify answerer that their answer was approved (+30 XP) (Requirement 20.4)
    if (answer.userId !== userId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: answer.userId },
      });
      if (!pref || pref.achievementAlert !== false) {
        await this.notificationService.createNotification(
          answer.userId,
          '✅ Jawabanmu di-approve! +30 XP',
          `Jawabanmu di pertanyaan "${answer.question.title}" sudah di-approve oleh penanya. +30 XP!`,
          { category: 'qna', actionUrl: `/qna/${answer.question.slug}` },
        );
      }
    }

    return updated;
  }

  /**
   * DB-persisted upvote: insert QnaVote + increment QnaAnswer.upvotes.
   */
  async upvoteAnswer(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({
      where: { id: answerId },
    });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.userId === userId)
      throw new ForbiddenException('Tidak bisa upvote jawaban sendiri.');

    // Check if user already voted
    const existingVote = await this.prisma.qnaVote.findUnique({
      where: { userId_answerId: { userId, answerId } },
    });
    if (existingVote) {
      throw new ConflictException('Anda sudah pernah upvote jawaban ini.');
    }

    // Insert vote + increment counter in a transaction
    const [, updated] = await this.prisma.$transaction([
      this.prisma.qnaVote.create({
        data: { userId, answerId, value: 1 },
      }),
      this.prisma.qnaAnswer.update({
        where: { id: answerId },
        data: { upvotes: { increment: 1 } },
      }),
    ]);

    return updated;
  }

  /**
   * Remove upvote: delete QnaVote + decrement QnaAnswer.upvotes.
   */
  async removeUpvote(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({
      where: { id: answerId },
    });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');

    const existingVote = await this.prisma.qnaVote.findUnique({
      where: { userId_answerId: { userId, answerId } },
    });
    if (!existingVote) {
      throw new NotFoundException('Anda belum upvote jawaban ini.');
    }

    // Delete vote + decrement counter in a transaction
    const [, updated] = await this.prisma.$transaction([
      this.prisma.qnaVote.delete({
        where: { userId_answerId: { userId, answerId } },
      }),
      this.prisma.qnaAnswer.update({
        where: { id: answerId },
        data: { upvotes: { decrement: 1 } },
      }),
    ]);

    return updated;
  }

  /**
   * Report an answer: insert QnaReport + increment reportCount.
   */
  async reportAnswer(userId: string, answerId: string, reason?: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({
      where: { id: answerId },
    });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.userId === userId)
      throw new ForbiddenException('Tidak bisa melaporkan jawaban sendiri.');

    // Check if user already reported
    const existingReport = await this.prisma.qnaReport.findUnique({
      where: { userId_answerId: { userId, answerId } },
    });
    if (existingReport) {
      throw new ConflictException('Anda sudah pernah melaporkan jawaban ini.');
    }

    // Insert report + increment counter in a transaction
    await this.prisma.$transaction([
      this.prisma.qnaReport.create({
        data: { userId, answerId, reason },
      }),
      this.prisma.qnaAnswer.update({
        where: { id: answerId },
        data: { reportCount: { increment: 1 } },
      }),
    ]);

    return { message: 'Laporan berhasil dikirim.' };
  }

  /**
   * Trending questions: sorted by total answer upvotes received within the last 7 days.
   * Sum of QnaVote.value where createdAt > 7 days ago.
   */
  async getTrendingQuestions(limit = 10) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find questions whose answers received the most upvotes in the past 7 days
    const trendingData = await this.prisma.qnaVote.groupBy({
      by: ['answerId'],
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
      _sum: { value: true },
      orderBy: { _sum: { value: 'desc' } },
    });

    if (trendingData.length === 0) {
      // Fallback: return most viewed questions
      const fallbackQuestions = await this.prisma.qnaQuestion.findMany({
        where: { isPublic: true },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { answers: true } },
        },
        orderBy: { viewCount: 'desc' },
        take: limit,
      });
      return {
        questions: fallbackQuestions,
        total: fallbackQuestions.length,
        page: 1,
        limit,
        totalPages: 1,
      };
    }

    // Get the answerIds and their question mapping
    const answerIds = trendingData.map((d) => d.answerId);
    const answers = await this.prisma.qnaAnswer.findMany({
      where: { id: { in: answerIds } },
      select: { id: true, questionId: true },
    });

    // Build a map of questionId -> total 7-day upvotes
    const questionScores = new Map<string, number>();
    for (const entry of trendingData) {
      const answer = answers.find((a) => a.id === entry.answerId);
      if (answer) {
        const current = questionScores.get(answer.questionId) || 0;
        questionScores.set(
          answer.questionId,
          current + (entry._sum.value || 0),
        );
      }
    }

    // Sort questionIds by score
    const sortedQuestionIds = [...questionScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (sortedQuestionIds.length === 0) {
      return {
        questions: [],
        total: 0,
        page: 1,
        limit,
        totalPages: 1,
      };
    }

    // Fetch the actual questions
    const questions = await this.prisma.qnaQuestion.findMany({
      where: {
        id: { in: sortedQuestionIds },
        isPublic: true,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        _count: { select: { answers: true } },
      },
    });

    // Maintain the sorted order and attach trending score
    const resultQuestions = sortedQuestionIds
      .map((id) => {
        const q = questions.find((question) => question.id === id);
        if (!q) return null;
        return { ...q, trendingScore: questionScores.get(id) || 0 };
      })
      .filter(Boolean);

    return {
      questions: resultQuestions as any[],
      total: resultQuestions.length,
      page: 1,
      limit,
      totalPages: 1,
    };
  }

  async deleteQuestion(userId: string, questionId: string) {
    const question = await this.prisma.qnaQuestion.findFirst({
      where: { id: questionId, userId },
    });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');
    return this.prisma.qnaQuestion.delete({ where: { id: questionId } });
  }

  async getReputation(userId: string) {
    const rep = await this.prisma.userReputation.findUnique({
      where: { userId },
    });
    return rep ?? {
      userId,
      score: 0,
      answersApproved: 0,
      questionsAsked: 0,
      reportCount: 0,
    };
  }

  async editQuestion(
    userId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ) {
    const question = await this.prisma.qnaQuestion.findFirst({
      where: { id: questionId, userId },
    });
    if (!question)
      throw new NotFoundException(
        'Pertanyaan tidak ditemukan atau bukan milik kamu.',
      );

    return this.prisma.qnaQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.category && { category: dto.category }),
        ...(dto.tags && { tags: dto.tags }),
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
