import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiJobService } from '../ai-job/ai-job.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { NotificationService } from '../notification/notification.service';
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
    private readonly notificationService: NotificationService,
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
        type: dto.type ?? 'todo',
        startTime: dto.startTime,
        endTime: dto.endTime,
        location: dto.location,
        eventType: dto.eventType,
        reminderMinutes: dto.reminderMinutes ?? [],
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
      },
      include: { reminders: true },
    });

    // Auto-create reminder records from reminderMinutes
    if (dto.reminderMinutes?.length && dto.dueDate) {
      await this.createRemindersFromMinutes(todo.id, new Date(dto.dueDate), dto.startTime || dto.dueTime, dto.reminderMinutes);
    }

    // Auto-generate future monthly instances if recurrence is set via DTO
    if ((dto as any).recurrence === 'monthly' && dto.dueDate) {
      await this.generateMonthlyInstances(userId, todo.id, todo.title, new Date(dto.dueDate), todo.description, todo.priority, todo.category, dto.dueTime);
    }

    return this.prisma.personalTodo.findUnique({
      where: { id: todo.id },
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Create TodoReminder records based on reminderMinutes array.
   * E.g., [5, 15, 60] means remind 5 min, 15 min, and 60 min before the event.
   */
  private async createRemindersFromMinutes(todoId: string, dueDate: Date, time?: string | null, minutes?: number[]) {
    if (!minutes?.length) return;

    // Calculate base datetime: dueDate + time
    const baseDate = new Date(dueDate);
    if (time) {
      const [h, m] = time.split(':').map(Number);
      baseDate.setHours(h, m, 0, 0);
    } else {
      baseDate.setHours(8, 0, 0, 0); // default 8am if no time
    }

    const reminders = minutes
      .map(mins => {
        const remindAt = new Date(baseDate.getTime() - mins * 60000);
        // Only create if in the future
        if (remindAt > new Date()) return { todoId, remindAt };
        return null;
      })
      .filter(Boolean) as { todoId: string; remindAt: Date }[];

    if (reminders.length > 0) {
      await this.prisma.todoReminder.createMany({ data: reminders });
    }
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

  async getAll(userId: string, query: { status?: string; priority?: string; category?: string; type?: string; page?: number; limit?: number }) {
    const where: any = { userId };
    // Don't filter by status in DB for recurring todos — we compute it dynamically
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;

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
        include: {
          reminders: true,
          subtasks: { orderBy: { createdAt: 'asc' } },
          sharedWith: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
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

    // Also include accepted shared todos
    const sharedTodos = await this.prisma.sharedTodo.findMany({
      where: { userId, accepted: true },
      include: {
        todo: {
          include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
        },
        sharer: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    for (const st of sharedTodos) {
      if (seen.has(st.todo.id)) continue;
      // Apply same filters
      if (query.status && st.todo.status !== query.status) continue;
      if (query.priority && st.todo.priority !== query.priority) continue;
      if (query.category && st.todo.category !== query.category) continue;
      if (query.type && st.todo.type !== query.type) continue;
      seen.add(st.todo.id);
      data.push({ ...st.todo, _sharedBy: st.sharer, _shareRole: st.role });
    }

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

    const updated = await this.prisma.personalTodo.update({
      where: { id },
      data,
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
    });

    // Recreate reminders if reminderMinutes or dueDate/time changed
    if (dto.reminderMinutes || dto.dueDate || dto.startTime || dto.dueTime) {
      const effectiveDate = dto.dueDate ? new Date(dto.dueDate) : todo.dueDate;
      const effectiveTime = dto.startTime ?? dto.dueTime ?? todo.startTime ?? todo.dueTime;
      const effectiveMinutes = dto.reminderMinutes ?? (todo.reminderMinutes as number[]);
      if (effectiveDate && effectiveMinutes?.length) {
        await this.prisma.todoReminder.deleteMany({ where: { todoId: id, sent: false } });
        await this.createRemindersFromMinutes(id, effectiveDate, effectiveTime, effectiveMinutes);
      }
    }

    // Notify shared users about the update
    this.notifySharedUsers(id, userId, `mengubah "${updated.title}"`).catch(() => {});

    return updated;
  }

  /**
   * Notify all shared users (except actor) about a change to a todo.
   */
  private async notifySharedUsers(todoId: string, actorId: string, action: string) {
    const sharedUsers = await this.prisma.sharedTodo.findMany({
      where: { todoId, accepted: true, userId: { not: actorId } },
      select: { userId: true },
    });

    // Also notify owner if actor is a shared user
    const todo = await this.prisma.personalTodo.findUnique({ where: { id: todoId }, select: { userId: true } });
    const recipientIds = new Set(sharedUsers.map(s => s.userId));
    if (todo && todo.userId !== actorId) recipientIds.add(todo.userId);

    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
    const actorName = actor?.fullName || 'Seseorang';

    for (const uid of recipientIds) {
      await this.notificationService.createNotification(
        uid,
        '✏️ Todo Diperbarui',
        `${actorName} ${action}`,
        { category: 'todo', actionUrl: '/todos' },
      );
    }
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

  /**
   * Get agenda for today and upcoming days.
   * Returns both todos and events sorted chronologically.
   */
  async getAgenda(userId: string, days: number = 7) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startOfToday);
    endDate.setDate(endDate.getDate() + days);

    const items = await this.prisma.personalTodo.findMany({
      where: {
        userId,
        status: 'pending',
        dueDate: { gte: startOfToday, lt: endDate },
      },
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ dueDate: 'asc' }, { startTime: 'asc' }, { dueTime: 'asc' }],
    });

    // Also get overdue items
    const overdue = await this.prisma.personalTodo.findMany({
      where: {
        userId,
        status: 'pending',
        dueDate: { lt: startOfToday },
      },
      include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ dueDate: 'asc' }],
    });

    // Group by date
    const grouped: Record<string, any[]> = {};
    for (const item of [...overdue, ...items]) {
      const dateKey = item.dueDate
        ? new Date(item.dueDate).toISOString().split('T')[0]
        : 'no-date';
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(item);
    }

    return { items: [...overdue, ...items], grouped };
  }

  /**
   * Check for schedule conflicts with events on a given date.
   */
  async checkConflicts(userId: string, date: string, startTime: string, endTime: string, excludeId?: string) {
    const dayStart = new Date(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const events = await this.prisma.personalTodo.findMany({
      where: {
        userId,
        type: 'event',
        dueDate: { gte: dayStart, lt: dayEnd },
        startTime: { not: null },
        endTime: { not: null },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    const conflicts: any[] = [];
    for (const event of events) {
      // Simple time overlap check (HH:mm string comparison works for same-day)
      if (event.startTime && event.endTime) {
        const existingStart = event.startTime;
        const existingEnd = event.endTime;
        if (startTime < existingEnd && endTime > existingStart) {
          conflicts.push({
            id: event.id,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
          });
        }
      }
    }

    return { hasConflict: conflicts.length > 0, conflicts };
  }

  async parseNaturalInput(userId: string, text: string) {
    await this.aiUsage.checkAndRecord(userId, 'todo_parse');
    return this.aiJob.run(userId, 'parse_todo', async () => {
    const prompt = `Kamu adalah asisten jadwal & to-do list. Parse input berikut menjadi task atau event/jadwal.
Input: "${text}"

Respond dalam JSON format:
{
  "title": string,
  "description": string | null,
  "dueDate": "YYYY-MM-DD" | null,
  "dueTime": "HH:mm" | null,
  "priority": "high" | "medium" | "low",
  "category": string | null,
  "tags": string[],
  "type": "todo" | "event",
  "startTime": "HH:mm" | null,
  "endTime": "HH:mm" | null,
  "location": string | null,
  "eventType": "meeting" | "kuliah" | "ujian" | "penting" | "lainnya" | null
}

Panduan:
- Jika input menyebut "meeting", "rapat", "kelas", "kuliah", "ujian", "acara", "jadwal", atau ada rentang waktu (jam X - jam Y), set type ke "event"
- Untuk event, isi startTime dan endTime jika ada rentang waktu
- eventType: meeting (rapat/meeting), kuliah (kelas/kuliah/perkuliahan), ujian (ujian/uts/uas/quiz), penting (deadline/penting), lainnya (lain-lain)
- Jika hanya ada satu waktu dan itu event, set startTime ke waktu tersebut
- Untuk todo biasa (tugas, kerjakan, beli, dll), set type ke "todo"
- Tanggal hari ini: ${new Date().toISOString().split('T')[0]}

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

  // ─── Auto-sync class tasks as todos ─────────────────────────────────

  async syncClassTasks(userId: string) {
    // Get all class tasks with deadlines for this user
    const memberships = await this.prisma.classMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { classId: true, class: { select: { name: true } } },
    });

    const classIds = memberships.map(m => m.classId);
    if (classIds.length === 0) return { synced: 0 };

    const classNameMap = new Map(memberships.map(m => [m.classId, m.class.name]));

    const classTasks = await this.prisma.task.findMany({
      where: {
        classId: { in: classIds },
        deadline: { not: null, gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Include tasks from last 7 days
      },
      select: { id: true, classId: true, title: true, description: true, deadline: true, taskType: true },
    });

    // Check which tasks already have a synced todo
    const existingSynced = await this.prisma.personalTodo.findMany({
      where: { userId, sourceType: 'task-deadline', sourceId: { in: classTasks.map(t => t.id) } },
      select: { sourceId: true },
    });
    const syncedIds = new Set(existingSynced.map(t => t.sourceId));

    // Create todos for un-synced tasks
    const toCreate = classTasks
      .filter(t => !syncedIds.has(t.id))
      .map(t => ({
        userId,
        title: `📋 ${t.title}`,
        description: t.description ? `[${classNameMap.get(t.classId) || 'Kelas'}] ${t.description.slice(0, 200)}` : `Tugas dari ${classNameMap.get(t.classId) || 'kelas'}`,
        dueDate: t.deadline,
        priority: 'high' as const,
        category: 'study',
        type: 'todo' as const,
        sourceType: 'task-deadline',
        sourceId: t.id,
        tags: ['kelas', classNameMap.get(t.classId) || ''],
      }));

    if (toCreate.length > 0) {
      await this.prisma.personalTodo.createMany({ data: toCreate });
    }

    return { synced: toCreate.length, total: classTasks.length };
  }

  // ─── AI Bulk Parse (image/file) ─────────────────────────────────────

  async parseBulkImage(userId: string, imageBase64: string, mimeType: string) {
    await this.aiUsage.checkAndRecord(userId, 'todo_parse');
    return this.aiJob.run(userId, 'parse_todo_bulk', async () => {
      const today = new Date().toISOString().split('T')[0];
      const prompt = `Kamu adalah asisten jadwal & to-do list. Analisis gambar berikut yang berisi jadwal/tugas/to-do list.

Ekstrak SEMUA item jadwal/tugas/event yang kamu temukan menjadi array JSON.

Format output (JSON array):
[
  {
    "title": string,
    "description": string | null,
    "dueDate": "YYYY-MM-DD" | null,
    "dueTime": "HH:mm" | null,
    "priority": "high" | "medium" | "low",
    "category": "study" | "work" | "personal" | "finance" | "goals" | null,
    "type": "todo" | "event",
    "startTime": "HH:mm" | null,
    "endTime": "HH:mm" | null,
    "location": string | null,
    "eventType": "meeting" | "kuliah" | "ujian" | "penting" | "lainnya" | null,
    "tags": string[]
  }
]

Panduan:
- Jika ada jadwal kuliah/meeting/event dgn waktu, set type "event" dan isi startTime/endTime
- Jika ada tugas/PR/kerjakan, set type "todo"
- Perkirakan priority dari konteks (ujian = high, kuliah rutin = medium)
- eventType: meeting (rapat), kuliah (kelas/kuliah), ujian (uts/uas/quiz), penting (deadline), lainnya
- Tanggal hari ini: ${today}
- Jika ada tanggal relatif (besok, lusa, minggu depan), konversi ke format YYYY-MM-DD
- Ekstrak SEMUA item yang ada, jangan skip

Hanya respond JSON array, tanpa markdown code blocks.`;

      let result: string;
      try {
        result = await this.ai.generateText(prompt, { imageBase64, mimeType });
      } catch {
        return [];
      }
      try {
        const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    });
  }

  // ─── Bulk Create ────────────────────────────────────────────────────

  async bulkCreate(userId: string, items: CreateTodoDto[]) {
    const data = items.map(dto => ({
      userId,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      dueTime: dto.dueTime,
      priority: dto.priority ?? 'medium',
      category: dto.category,
      tags: dto.tags ?? [],
      type: dto.type ?? 'todo',
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location,
      eventType: dto.eventType,
      reminderMinutes: dto.reminderMinutes ?? [],
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
    }));

    const result = await this.prisma.personalTodo.createMany({ data });
    return { created: result.count };
  }

  // ==============================
  // Sharing
  // ==============================

  /**
   * Share a todo/event with another user by email.
   */
  async shareTodo(userId: string, todoId: string, targetEmail: string, role: string = 'viewer') {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id: todoId, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    const targetUser = await this.prisma.user.findUnique({ where: { email: targetEmail } });
    if (!targetUser) throw new NotFoundException('User dengan email tersebut tidak ditemukan.');
    if (targetUser.id === userId) throw new Error('Tidak bisa share ke diri sendiri.');

    const sharer = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });

    const shared = await this.prisma.sharedTodo.upsert({
      where: { todoId_userId: { todoId, userId: targetUser.id } },
      update: { role, accepted: false },
      create: { todoId, userId: targetUser.id, sharedBy: userId, role },
    });

    // Notify the target user
    await this.notificationService.createNotification(
      targetUser.id,
      '📩 Todo/Jadwal Dibagikan',
      `${sharer?.fullName || 'Seseorang'} membagikan "${todo.title}" denganmu.`,
      { category: 'todo', actionUrl: '/todos' },
    );

    return { shared, targetUser: { id: targetUser.id, email: targetUser.email, fullName: targetUser.fullName } };
  }

  /**
   * Accept or reject a shared todo invitation.
   */
  async respondToShare(userId: string, shareId: string, accept: boolean) {
    const shared = await this.prisma.sharedTodo.findFirst({ where: { id: shareId, userId } });
    if (!shared) throw new NotFoundException('Undangan tidak ditemukan.');

    if (!accept) {
      await this.prisma.sharedTodo.delete({ where: { id: shareId } });
      return { message: 'Undangan ditolak.' };
    }

    await this.prisma.sharedTodo.update({ where: { id: shareId }, data: { accepted: true } });
    return { message: 'Berhasil bergabung!' };
  }

  /**
   * Get all todos shared with a user.
   */
  async getSharedWithMe(userId: string) {
    const shares = await this.prisma.sharedTodo.findMany({
      where: { userId },
      include: {
        todo: { include: { reminders: true, subtasks: { orderBy: { createdAt: 'asc' } } } },
        sharer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return shares;
  }

  /**
   * Get shared users for a specific todo.
   */
  async getSharedUsers(userId: string, todoId: string) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id: todoId, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    const shares = await this.prisma.sharedTodo.findMany({
      where: { todoId },
      include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
    });
    return shares;
  }

  /**
   * Remove sharing for a todo.
   */
  async unshareTodo(userId: string, todoId: string, targetUserId: string) {
    const todo = await this.prisma.personalTodo.findFirst({ where: { id: todoId, userId } });
    if (!todo) throw new NotFoundException('To-do tidak ditemukan.');

    await this.prisma.sharedTodo.deleteMany({ where: { todoId, userId: targetUserId } });
    return { message: 'Sharing dihapus.' };
  }
}
