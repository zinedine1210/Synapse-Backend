import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';

@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async create(userId: string, dto: CreateTodoDto) {
    return this.prisma.personalTodo.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueTime: dto.dueTime,
        priority: dto.priority ?? 'medium',
        category: dto.category,
        tags: dto.tags ?? [],
        inputMethod: dto.inputMethod ?? 'text',
      },
      include: { reminders: true },
    });
  }

  async getAll(userId: string, query: { status?: string; priority?: string; category?: string }) {
    const where: any = { userId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;

    return this.prisma.personalTodo.findMany({
      where,
      include: { reminders: true },
      orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(userId: string, id: string) {
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id, userId },
      include: { reminders: true },
    });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');
    return todo;
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    const data: any = { ...dto };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.status === 'done' && todo.status !== 'done') {
      data.completedAt = new Date();
    }

    return this.prisma.personalTodo.update({
      where: { id },
      data,
      include: { reminders: true },
    });
  }

  async toggleDone(userId: string, id: string) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    const newStatus = todo.status === 'done' ? 'pending' : 'done';
    return this.prisma.personalTodo.update({
      where: { id },
      data: {
        status: newStatus,
        completedAt: newStatus === 'done' ? new Date() : null,
      },
      include: { reminders: true },
    });
  }

  async delete(userId: string, id: string) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');
    return this.prisma.personalTodo.delete({ where: { id } });
  }

  async getStats(userId: string) {
    const [total, done, pending, overdue] = await Promise.all([
      this.prisma.personalTodo.count({ where: { userId } }),
      this.prisma.personalTodo.count({ where: { userId, status: 'done' } }),
      this.prisma.personalTodo.count({ where: { userId, status: 'pending' } }),
      this.prisma.personalTodo.count({
        where: { userId, status: 'pending', dueDate: { lt: new Date() } },
      }),
    ]);

    return { total, done, pending, overdue };
  }

  async parseNaturalInput(userId: string, text: string) {
    const prompt = `Kamu adalah asisten to-do list. Parse input berikut menjadi task.
Input: "${text}"

Respond dalam JSON format:
{
  "title": string,
  "description": string | null,
  "dueDate": "YYYY-MM-DD" | null,
  "dueTime": "HH:mm" | null,
  "priority": "high" | "medium" | "low",
  "category": string | null,
  "tags": string[]
}

Hanya respond JSON, tanpa markdown.`;

    const result = await this.ai.generateText(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      return { title: text };
    }
  }
}
