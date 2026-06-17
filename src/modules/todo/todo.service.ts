import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';
import { ReorderTodosDto } from './dto/reorder-todo.dto';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtask.dto';
import { SetRecurrenceDto } from './dto/recurrence.dto';

@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiJob: AiJobService,
  ) {}

  /**
   * Check if a recurring todo's completion is still valid for the current period.
   * Returns true if the todo should be considered "done" in the current period.
   */
  private isCompletedInCurrentPeriod(completedAt: Date | null, recurrence: string): boolean {
    if (!completedAt) return false;
    const now = new Date();
    const completed = new Date(completedAt);

    switch (recurrence) {
      case 'daily':
        return completed.toDateString() === now.toDateString();
      case 'weekly': {
        // Same ISO week
        const getWeekStart = (d: Date) => {
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          return new Date(d.getFullYear(), d.getMonth(), diff).toDateString();
        };
        return getWeekStart(completed) === getWeekStart(now);
      }
      case 'monthly':
        return completed.getFullYear() === now.getFullYear() && completed.getMonth() === now.getMonth();
      default:
        return true;
    }
  }

  /**
   * Process recurring todos: reset status to pending if completed in a previous period.
   */
  private processRecurringTodos(todos: any[]): any[] {
    return todos.map(todo => {
      if (todo.recurrence && todo.status === 'done') {
        if (!this.isCompletedInCurrentPeriod(todo.completedAt, todo.recurrence)) {
          return { ...todo, status: 'pending', _recurringReset: true };
        }
      }
      return todo;
    });
  }

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
    // Don't filter by status in DB for recurring todos — we compute it dynamically
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;

    const page = query.page || 1;
    const limit = query.limit || 10;

    // If filtering by status, also fetch recurring todos that might be in different state
    let recurringAddition: any[] = [];
    if (query.status) {
      recurringAddition = await this.prisma.personalTodo.findMany({
        where: { userId, recurrence: { not: null }, status: query.status === 'pending' ? 'done' : 'pending' },
        include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
      });
    }

    const [rawData, total] = await Promise.all([
      this.prisma.personalTodo.findMany({
        where,
        include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.personalTodo.count({ where }),
    ]);

    // Apply recurring period logic
    let data = this.processRecurringTodos([...rawData, ...recurringAddition]);

    // Re-filter by status after recurring processing
    if (query.status) {
      data = data.filter(t => t.status === query.status);
    }

    // Remove duplicates
    const seen = new Set<string>();
    data = data.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

    return { data, total: data.length, page, limit, totalPages: Math.ceil(data.length / limit) };
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
    const allTodos = await this.prisma.personalTodo.findMany({ where: { userId } });
    const processed = this.processRecurringTodos(allTodos);

    const total = processed.length;
    const done = processed.filter(t => t.status === 'done').length;
    const pending = processed.filter(t => t.status === 'pending').length;
    const overdue = processed.filter(t => t.status === 'pending' && t.dueDate && new Date(t.dueDate) < new Date()).length;

    return { total, done, pending, overdue };
  }

  async parseNaturalInput(userId: string, text: string) {
    return this.aiJob.run(userId, 'parse_todo', async () => {
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

    let result: string;
    try {
      result = await this.ai.generateText(prompt);
    } catch {
      return { title: text };
    }
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      return { title: text };
    }
    }); // end aiJob.run
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
