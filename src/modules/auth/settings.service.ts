import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateSettingsProfileDto } from './dto/update-settings-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateQuietHoursDto } from './dto/update-quiet-hours.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update user profile (fullName, avatarUrl).
   */
  async updateProfile(userId: string, dto: UpdateSettingsProfileDto) {
    const data: Record<string, any> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        email: true,
      },
    });

    return { message: 'Profil berhasil diperbarui.', user };
  }

  /**
   * Get all user preferences (notification prefs + settings).
   */
  async getPreferences(userId: string) {
    // Ensure UserSettings exists (upsert)
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    // Ensure NotificationPreference exists (upsert)
    const notifPref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return {
      theme: settings.theme,
      language: settings.language,
      accountStatus: settings.accountStatus,
      notifications: {
        deadlineReminder: notifPref.deadlineReminder,
        budgetAlert: notifPref.budgetAlert,
        streakReminder: notifPref.streakReminder,
        idleReminder: notifPref.idleReminder,
        weeklyRecap: notifPref.weeklyRecap,
        forumReply: notifPref.forumReply,
        qnaAnswer: notifPref.qnaAnswer,
        achievementAlert: notifPref.achievementAlert,
        quietHoursStart: notifPref.quietHoursStart,
        quietHoursEnd: notifPref.quietHoursEnd,
      },
    };
  }

  /**
   * Update user preferences (notification toggles + theme + language).
   */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    // Separate notification fields from settings fields
    const notifFields: Record<string, any> = {};
    const settingsFields: Record<string, any> = {};

    if (dto.deadlineReminder !== undefined) notifFields.deadlineReminder = dto.deadlineReminder;
    if (dto.budgetAlert !== undefined) notifFields.budgetAlert = dto.budgetAlert;
    if (dto.streakReminder !== undefined) notifFields.streakReminder = dto.streakReminder;
    if (dto.idleReminder !== undefined) notifFields.idleReminder = dto.idleReminder;
    if (dto.weeklyRecap !== undefined) notifFields.weeklyRecap = dto.weeklyRecap;
    if (dto.forumReply !== undefined) notifFields.forumReply = dto.forumReply;
    if (dto.qnaAnswer !== undefined) notifFields.qnaAnswer = dto.qnaAnswer;
    if (dto.achievementAlert !== undefined) notifFields.achievementAlert = dto.achievementAlert;

    if (dto.theme !== undefined) settingsFields.theme = dto.theme;
    if (dto.language !== undefined) settingsFields.language = dto.language;

    // Update notification preferences if any
    if (Object.keys(notifFields).length > 0) {
      await this.prisma.notificationPreference.upsert({
        where: { userId },
        update: notifFields,
        create: { userId, ...notifFields },
      });
    }

    // Update user settings if any
    if (Object.keys(settingsFields).length > 0) {
      await this.prisma.userSettings.upsert({
        where: { userId },
        update: settingsFields,
        create: { userId, ...settingsFields },
      });
    }

    return { message: 'Preferensi berhasil diperbarui.' };
  }

  /**
   * Update quiet hours window.
   */
  async updateQuietHours(userId: string, dto: UpdateQuietHoursDto) {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        quietHoursStart: dto.quietHoursStart ?? null,
        quietHoursEnd: dto.quietHoursEnd ?? null,
      },
      create: {
        userId,
        quietHoursStart: dto.quietHoursStart ?? null,
        quietHoursEnd: dto.quietHoursEnd ?? null,
      },
    });

    return { message: 'Quiet hours berhasil diperbarui.' };
  }

  /**
   * Generate CSV export of user transactions + todos.
   * Rate limited: 1 export per hour per user.
   */
  async exportData(userId: string) {
    // Check rate limit (1 per hour)
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    if (settings.exportRequested) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (settings.exportRequested > oneHourAgo) {
        throw new HttpException(
          'Ekspor data hanya bisa dilakukan 1x per jam. Coba lagi nanti.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Update exportRequested timestamp
    await this.prisma.userSettings.update({
      where: { userId },
      data: { exportRequested: new Date() },
    });

    // Fetch transactions
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });

    // Fetch todos
    const todos = await this.prisma.personalTodo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV
    const csv = this.generateCsv(transactions, todos);

    return {
      message: 'Data berhasil diekspor.',
      csv,
      filename: `synapse-export-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  /**
   * Soft delete user account with double-confirmation.
   * Requires user to type "HAPUS AKUN" as confirmation.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const CONFIRMATION_TEXT = 'HAPUS AKUN';

    if (dto.confirmationText !== CONFIRMATION_TEXT) {
      throw new BadRequestException(
        `Untuk menghapus akun, ketik "${CONFIRMATION_TEXT}" sebagai konfirmasi.`,
      );
    }

    // Soft delete: update accountStatus and set deletedAt
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        accountStatus: 'DELETED',
        deletedAt: new Date(),
      },
      create: {
        userId,
        accountStatus: 'DELETED',
        deletedAt: new Date(),
      },
    });

    this.logger.warn(`Account soft-deleted: userId=${userId}`);

    return {
      message: 'Akun berhasil dihapus. Data akan dihapus permanen dalam 30 hari.',
    };
  }

  /**
   * Generate CSV string from transactions and todos.
   */
  private generateCsv(transactions: any[], todos: any[]): string {
    const lines: string[] = [];

    // Transaction section
    lines.push('=== TRANSACTIONS ===');
    lines.push('date,type,category,label,amount,note');
    for (const tx of transactions) {
      const date = new Date(tx.date).toISOString().slice(0, 10);
      const label = this.escapeCsvField(tx.label);
      const note = this.escapeCsvField(tx.note || '');
      const category = this.escapeCsvField(tx.category);
      lines.push(`${date},${tx.type},${category},${label},${tx.amount},${note}`);
    }

    // Separator
    lines.push('');

    // Todo section
    lines.push('=== TODOS ===');
    lines.push('title,status,priority,category,dueDate,createdAt');
    for (const todo of todos) {
      const title = this.escapeCsvField(todo.title);
      const category = this.escapeCsvField(todo.category || '');
      const dueDate = todo.dueDate
        ? new Date(todo.dueDate).toISOString().slice(0, 10)
        : '';
      const createdAt = new Date(todo.createdAt).toISOString().slice(0, 10);
      lines.push(
        `${title},${todo.status},${todo.priority},${category},${dueDate},${createdAt}`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Escape a field value for CSV (handle commas, quotes, newlines).
   */
  private escapeCsvField(value: string): string {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
