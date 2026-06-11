import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface SearchResponse {
  tasks: { id: string; title: string; className: string; deadline?: string }[];
  todos: { id: string; title: string; dueDate?: string }[];
  transactions: { id: string; label: string; amount: number; type: string }[];
  qna: { id: string; title: string; slug: string }[];
  sessions: { id: string; title: string; className: string; sequence: number }[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, query: string, limit: number = 20): Promise<SearchResponse> {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Minimum 2 karakter');
    }

    const q = query.trim();
    const perCategory = Math.max(1, Math.ceil(limit / 5));

    // Get user's class IDs for tasks and sessions
    const memberships = await this.prisma.classMember.findMany({
      where: { userId },
      select: { classId: true },
    });
    const classIds = memberships.map((m) => m.classId);

    // Run all queries in parallel
    const [tasks, todos, transactions, qna, sessions] = await Promise.all([
      this.searchTasks(classIds, q, perCategory),
      this.searchTodos(userId, q, perCategory),
      this.searchTransactions(userId, q, perCategory),
      this.searchQna(userId, q, perCategory),
      this.searchSessions(classIds, q, perCategory),
    ]);

    return { tasks, todos, transactions, qna, sessions };
  }

  private async searchTasks(classIds: string[], query: string, limit: number) {
    if (classIds.length === 0) return [];

    const tasks = await this.prisma.task.findMany({
      where: {
        classId: { in: classIds },
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { class: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        class: { select: { name: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      className: t.class.name,
      ...(t.deadline ? { deadline: t.deadline.toISOString() } : {}),
    }));
  }

  private async searchTodos(userId: string, query: string, limit: number) {
    const todos = await this.prisma.personalTodo.findMany({
      where: {
        userId,
        title: { contains: query, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return todos.map((t) => ({
      id: t.id,
      title: t.title,
      ...(t.dueDate ? { dueDate: t.dueDate.toISOString() } : {}),
    }));
  }

  private async searchTransactions(userId: string, query: string, limit: number) {
    // Search by label or type, also try parsing as number for amount
    const amountQuery = parseFloat(query);
    const hasNumericQuery = !isNaN(amountQuery);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          { label: { contains: query, mode: 'insensitive' } },
          { type: { contains: query, mode: 'insensitive' } },
          ...(hasNumericQuery ? [{ amount: amountQuery }] : []),
        ],
      },
      take: limit,
      orderBy: { date: 'desc' },
    });

    return transactions.map((t) => ({
      id: t.id,
      label: t.label,
      amount: t.amount,
      type: t.type,
    }));
  }

  private async searchQna(userId: string, query: string, limit: number) {
    const questions = await this.prisma.qnaQuestion.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return questions.map((q) => ({
      id: q.id,
      title: q.title,
      slug: q.slug,
    }));
  }

  private async searchSessions(classIds: string[], query: string, limit: number) {
    if (classIds.length === 0) return [];

    const sessions = await this.prisma.session.findMany({
      where: {
        classId: { in: classIds },
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { class: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        class: { select: { name: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      className: s.class.name,
      sequence: s.sequence,
    }));
  }
}
