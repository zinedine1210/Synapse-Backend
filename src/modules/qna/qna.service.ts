import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateQuestionDto, CreateAnswerDto, UpdateQuestionDto } from './dto/qna.dto';

@Injectable()
export class QnaService {
  // Track upvotes per user to prevent spam (answerId:userId → true)
  private readonly upvoteTracker = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 80) + '-' + Date.now().toString(36);
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
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    // Update reputation
    await this.prisma.userReputation.upsert({
      where: { userId },
      update: { questionsAsked: { increment: 1 }, score: { increment: 1 } },
      create: { userId, questionsAsked: 1, score: 1 },
    });

    return question;
  }

  async getQuestions(query: { category?: string; status?: string; search?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
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

    return { questions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getBySlug(slug: string) {
    const question = await this.prisma.qnaQuestion.findUnique({
      where: { slug },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        answers: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: [{ isApprovedByAsker: 'desc' }, { upvotes: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');

    // Increment view count
    await this.prisma.qnaQuestion.update({
      where: { slug },
      data: { viewCount: { increment: 1 } },
    });

    return question;
  }

  async getMyQuestions(userId: string) {
    return this.prisma.qnaQuestion.findMany({
      where: { userId },
      include: { _count: { select: { answers: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnswer(userId: string, questionId: string, dto: CreateAnswerDto) {
    const question = await this.prisma.qnaQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');

    const answer = await this.prisma.qnaAnswer.create({
      data: {
        questionId,
        userId,
        body: dto.body,
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    // Update question status
    if (question.status === 'open') {
      await this.prisma.qnaQuestion.update({
        where: { id: questionId },
        data: { status: 'answered' },
      });
    }

    return answer;
  }

  async approveAnswer(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({
      where: { id: answerId },
      include: { question: true },
    });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.question.userId !== userId) throw new ForbiddenException('Hanya pemilik pertanyaan yang bisa approve.');

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

    return updated;
  }

  async upvoteAnswer(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({ where: { id: answerId } });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.userId === userId) throw new ForbiddenException('Tidak bisa upvote jawaban sendiri.');

    // Prevent duplicate upvotes per user
    const key = `${answerId}:${userId}`;
    if (this.upvoteTracker.has(key)) {
      throw new ForbiddenException('Anda sudah pernah upvote jawaban ini.');
    }

    this.upvoteTracker.add(key);
    // Prevent memory leak: cap at 50k entries
    if (this.upvoteTracker.size > 50000) {
      const entries = [...this.upvoteTracker];
      entries.slice(0, 10000).forEach(e => this.upvoteTracker.delete(e));
    }

    return this.prisma.qnaAnswer.update({
      where: { id: answerId },
      data: { upvotes: { increment: 1 } },
    });
  }

  async deleteQuestion(userId: string, questionId: string) {
    const question = await this.prisma.qnaQuestion.findFirst({ where: { id: questionId, userId } });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan.');
    return this.prisma.qnaQuestion.delete({ where: { id: questionId } });
  }

  async getReputation(userId: string) {
    const rep = await this.prisma.userReputation.findUnique({ where: { userId } });
    return rep ?? { userId, score: 0, answersApproved: 0, questionsAsked: 0, reportCount: 0 };
  }

  async editQuestion(userId: string, questionId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.qnaQuestion.findFirst({ where: { id: questionId, userId } });
    if (!question) throw new NotFoundException('Pertanyaan tidak ditemukan atau bukan milik kamu.');

    return this.prisma.qnaQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.category && { category: dto.category }),
        ...(dto.tags && { tags: dto.tags }),
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
  }

  async reportAnswer(userId: string, answerId: string) {
    const answer = await this.prisma.qnaAnswer.findUnique({ where: { id: answerId } });
    if (!answer) throw new NotFoundException('Jawaban tidak ditemukan.');
    if (answer.userId === userId) throw new ForbiddenException('Tidak bisa melaporkan jawaban sendiri.');

    await this.prisma.qnaAnswer.update({
      where: { id: answerId },
      data: { reportCount: { increment: 1 } },
    });

    return { message: 'Laporan berhasil dikirim.' };
  }
}
