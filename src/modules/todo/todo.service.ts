import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
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
    private readonly aiUsage: AiUsageService,
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
    const todo = await this.prisma.personalTodo.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueTime: dto.dueTime,
        priority: dto.priority ?? 'medium',
        category: dto.category,
        tags: dto.tags ?? [],
      },
      include: { reminders: true },
    });

    // Auto-generate future monthly instances if recurrence is set via DTO
    if ((dto as any).recurrence === 'monthly' && dto.dueDate) {
      await this.generateMonthlyInstances(userId, todo.id, todo.title, new Date(dto.dueDate), todo.description, todo.priority, todo.category, dto.dueTime);
    }

    return todo;
  }

  /**
   * Generate future monthly instances linked via parentTodoId.
   * Creates instances for the next 6 months.
   */
  private async generateMonthlyInstances(
    userId: string,
    parentId: string,
    title: string,
    baseDueDate: Date,
    description?: string | null,
    priority?: string,
    category?: string | null,
    dueTime?: string | null,
  ) {
    const instances = [];
    const day = baseDueDate.getDate();

    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(baseDueDate);
      futureDate.setMonth(futureDate.getMonth() + i);
      // Handle months with fewer days (e.g., Jan 31 -> Feb 28)
      if (futureDate.getDate() !== day) {
        futureDate.setDate(0); // last day of previous month
      }

      instances.push({
        userId,
        title,
        description,
        dueDate: futureDate,
        dueTime,
        priority: priority ?? 'medium',
        category,
        parentTodoId: parentId,
        recurrence: 'monthly',
      });
    }

    if (instances.length > 0) {
      await this.prisma.personalTodo.createMany({ data: instances });
    }
  }

  async getAll(userId: string, query: { status?: string; priority?: string; category?: string; page?: number; limit?: number }) {
    const where: any = { userId };
    // Don't filter by status in DB for recurring todos — we compute it dynamically
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;

    // In list view (default), exclude child monthly instances — show only parent
    // Calendar view should call getUnifiedTimeline which returns all
    if (!(query as any).includeChildren) {
      where.parentTodoId = null;
    }

    const page = query.page || 1;
    const limit = query.limit || 10;

    // If filtering by status, also fetch recurring todos that might be in different state
    let recurringAddition: any[] = [];
    if (query.status) {
      const recurringWhere: any = {
        userId,
        recurrence: { not: null },
        status: query.status === 'pending' ? 'done' : 'pending',
      };
      if (!(query as any).includeChildren) recurringWhere.parentTodoId = null;
      recurringAddition = await this.prisma.personalTodo.findMany({
        where: recurringWhere,
        include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
      });
    }

    const [rawData] = await Promise.all([
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
    await this.aiUsage.checkAndRecord(userId, 'todo_parse');
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

    const updated = await this.prisma.personalTodo.update({
      where: { id: todoId },
      data: { recurrence: dto.recurrence },
      include: { reminders: true, subtasks: true },
    });

    // If setting to monthly and has a dueDate, auto-generate future instances
    if (dto.recurrence === 'monthly' && todo.dueDate) {
      // Remove any existing child instances first
      await this.prisma.personalTodo.deleteMany({
        where: { parentTodoId: todoId, userId },
      });
      await this.generateMonthlyInstances(
        userId, todoId, todo.title, todo.dueDate,
        todo.description, todo.priority, todo.category,
      );
    } else if (!dto.recurrence) {
      // Removing recurrence — clean up child instances
      await this.prisma.personalTodo.deleteMany({
        where: { parentTodoId: todoId, userId },
      });
    }

    return updated;
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

  // ─── Bulk operations ────────────────────────────────────────────────

  async bulkDelete(userId: string, ids: string[]) {
    const result = await this.prisma.personalTodo.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return { deleted: result.count };
  }

  async bulkToggleDone(userId: string, ids: string[], done: boolean) {
    const result = await this.prisma.personalTodo.updateMany({
      where: { id: { in: ids }, userId },
      data: { status: done ? 'done' : 'pending', completedAt: done ? new Date() : null },
    });
    return { updated: result.count };
  }

  async bulkUpdateCategory(userId: string, ids: string[], category: string) {
    const result = await this.prisma.personalTodo.updateMany({
      where: { id: { in: ids }, userId },
      data: { category },
    });
    return { updated: result.count };
  }

  async bulkUpdatePriority(userId: string, ids: string[], priority: string) {
    const result = await this.prisma.personalTodo.updateMany({
      where: { id: { in: ids }, userId },
      data: { priority },
    });
    return { updated: result.count };
  }

  // ─── Reminders ──────────────────────────────────────────────────────

  async setReminder(userId: string, todoId: string, remindAt: Date) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id: todoId, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    // Upsert — one reminder per todo for simplicity
    const existing = await this.prisma.todoReminder.findFirst({ where: { todoId } });
    if (existing) {
      return this.prisma.todoReminder.update({ where: { id: existing.id }, data: { remindAt, sent: false } });
    }
    return this.prisma.todoReminder.create({ data: { todoId, remindAt } });
  }

  async deleteReminder(userId: string, todoId: string) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id: todoId, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');
    await this.prisma.todoReminder.deleteMany({ where: { todoId } });
    return { message: 'Reminder dihapus.' };
  }
}
