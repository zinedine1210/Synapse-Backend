import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';
import { ReorderTodosDto } from './dto/reorder-todo.dto';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtask.dto';
import { SetRecurrenceDto } from './dto/recurrence.dto';

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
      },
      include: { reminders: true },
    });
  }

  async getAll(userId: string, query: { status?: string; priority?: string; category?: string; page?: number; limit?: number }) {
    const where: any = { userId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;

    const page = query.page || 1;
    const limit = query.limit || 30;

    const [data, total] = await Promise.all([
      this.prisma.personalTodo.findMany({
        where,
        include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.personalTodo.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(userId: string, id: string) {
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id, userId },
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
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
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
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
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
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

  // ==============================
  // Reorder
  // ==============================

  async reorder(userId: string, dto: ReorderTodosDto) {
    // Verify all todos belong to the user
    const todoIds = dto.items.map((item) => item.id);
    const todos = await this.prisma.personalTodo.findMany({
      where: { id: { in: todoIds }, userId },
      select: { id: true },
    });

    const foundIds = new Set(todos.map((t) => t.id));
    const invalidIds = todoIds.filter((id) => !foundIds.has(id));
    if (invalidIds.length > 0) {
      throw new NotFoundException(
        `To-do tidak ditemukan: ${invalidIds.join(', ')}`,
      );
    }

    // Batch update sort orders using a transaction
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.personalTodo.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return { success: true, updated: dto.items.length };
  }

  // ==============================
  // Subtasks
  // ==============================

  async createSubtask(userId: string, todoId: string, dto: CreateSubtaskDto) {
    // Verify the todo belongs to the user
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id: todoId, userId },
    });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    // Get max sortOrder for existing subtasks
    const maxSort = await this.prisma.todoSubtask.aggregate({
      where: { todoId },
      _max: { sortOrder: true },
    });

    return this.prisma.todoSubtask.create({
      data: {
        todoId,
        title: dto.title,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateSubtask(
    userId: string,
    todoId: string,
    subId: string,
    dto: UpdateSubtaskDto,
  ) {
    // Verify the todo belongs to the user
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id: todoId, userId },
    });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    // Verify the subtask belongs to the todo
    const subtask = await this.prisma.todoSubtask.findFirst({
      where: { id: subId, todoId },
    });
    if (!subtask) throw new NotFoundException('Subtask tidak ditemukan.');

    const data: any = {};
    if (dto.isDone !== undefined) data.isDone = dto.isDone;
    if (dto.title !== undefined) data.title = dto.title;

    return this.prisma.todoSubtask.update({
      where: { id: subId },
      data,
    });
  }

  async deleteSubtask(userId: string, todoId: string, subId: string) {
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id: todoId, userId },
    });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    const subtask = await this.prisma.todoSubtask.findFirst({
      where: { id: subId, todoId },
    });
    if (!subtask) throw new NotFoundException('Subtask tidak ditemukan.');

    return this.prisma.todoSubtask.delete({ where: { id: subId } });
  }

  // ==============================
  // Recurrence
  // ==============================

  async setRecurrence(userId: string, todoId: string, dto: SetRecurrenceDto) {
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id: todoId, userId },
    });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    return this.prisma.personalTodo.update({
      where: { id: todoId },
      data: { recurrence: dto.recurrence },
      include: { reminders: true, subtasks: true },
    });
  }

  // ==============================
  // Unified Timeline
  // ==============================

  async getUnifiedTimeline(userId: string) {
    // Get personal todos with due dates
    const personalTodos = await this.prisma.personalTodo.findMany({
      where: {
        userId,
        dueDate: { not: null },
      },
      include: { subtasks: true },
      orderBy: { dueDate: 'asc' },
    });

    // Get class task deadlines from enrolled classes
    const memberships = await this.prisma.classMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { classId: true, class: { select: { name: true } } },
    });

    const classIds = memberships.map((m) => m.classId);
    const classNameMap = new Map(
      memberships.map((m) => [m.classId, m.class.name]),
    );

    const classTasks = await this.prisma.task.findMany({
      where: {
        classId: { in: classIds },
        deadline: { not: null },
      },
      orderBy: { deadline: 'asc' },
      select: {
        id: true,
        classId: true,
        title: true,
        description: true,
        deadline: true,
        taskType: true,
      },
    });

    // Merge and sort by due date
    const timeline = [
      ...personalTodos.map((todo) => ({
        id: todo.id,
        type: 'personal' as const,
        title: todo.title,
        description: todo.description,
        dueDate: todo.dueDate,
        priority: todo.priority,
        status: todo.status,
        category: todo.category,
        subtasks: todo.subtasks,
      })),
      ...classTasks.map((task) => ({
        id: task.id,
        type: 'class' as const,
        title: task.title,
        description: task.description,
        dueDate: task.deadline,
        className: classNameMap.get(task.classId) || null,
        taskType: task.taskType,
      })),
    ].sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dateA - dateB;
    });

    return timeline;
  }
}
