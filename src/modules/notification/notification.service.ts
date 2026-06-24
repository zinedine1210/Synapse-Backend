import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { WebPushService } from './web-push.service';

interface GetNotificationsOptions {
  page: number;
  limit: number;
  category?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    private readonly webPush: WebPushService,
  ) {}

  /**
   * GET /notifications — Paginated list with optional category filter.
   * Returns notifications, pagination metadata, and unread count.
   */
  async getUserNotifications(userId: string, options: GetNotificationsOptions) {
    const { page, limit, category } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (category) {
      where.category = category;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * PATCH /notifications/:id/read — Mark single notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /**
   * PATCH /notifications/read-all — Mark all notifications as read for the user.
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Semua notifikasi ditandai telah dibaca.' };
  }

  /**
   * GET /notifications/unread-count — Returns { count: number } for badge.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /**
   * Create a notification with quiet hours suppression logic.
   * If the user is within quiet hours, the notification is stored but queued (not emitted via socket).
   * Queued notifications are delivered once quiet hours end.
   */
  async createNotification(
    userId: string,
    title: string,
    message: string,
    options?: { category?: string; actionUrl?: string },
  ) {
    // Check quiet hours before emitting real-time notification
    const isQuietHours = await this.isWithinQuietHours(userId);

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        category: options?.category || null,
        actionUrl: options?.actionUrl || null,
      },
    });

    // Only emit real-time notification if NOT in quiet hours
    if (!isQuietHours) {
      this.notificationGateway.emitNotification(userId, notification);
      const unreadCount = await this.prisma.notification.count({
        where: { userId, isRead: false },
      });
      this.notificationGateway.emitUnreadCount(userId, unreadCount);

      // Also send push notification to all user devices
      this.webPush.sendPushToUser(userId, {
        title,
        body: message,
        url: options?.actionUrl || '/dashboard',
        icon: '/icons/icon-192x192.png',
      }).catch((err) => {
        this.logger.debug(`Push notification failed for ${userId}: ${err?.message}`);
      });
    } else {
      this.logger.debug(
        `Notification queued for user ${userId} (quiet hours active): "${title}"`,
      );
    }

    return notification;
  }

  /**
   * Notify all members of a class (except the actor).
   */
  async notifyClassMembers(
    classId: string,
    excludeUserId: string,
    title: string,
    message: string,
    options?: { category?: string; actionUrl?: string },
  ) {
    const members = await this.prisma.classMember.findMany({
      where: { classId },
      select: { userId: true },
    });
    const recipientIds = members
      .map((m) => m.userId)
      .filter((id) => id !== excludeUserId);
    for (const uid of recipientIds) {
      await this.createNotification(uid, title, message, options);
    }
  }

  /**
   * Check if the current time falls within a user's quiet hours window.
   * Quiet hours are specified as HH:mm strings (e.g., "22:00" to "07:00").
   * Handles overnight windows (e.g., 22:00 → 07:00).
   */
  async isWithinQuietHours(userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref || !pref.quietHoursStart || !pref.quietHoursEnd) {
      return false;
    }

    return this.checkQuietHours(
      pref.quietHoursStart,
      pref.quietHoursEnd,
      new Date(),
    );
  }

  /**
   * Pure logic: check if a given time falls within a quiet hours window.
   * Exported for testability.
   */
  checkQuietHours(start: string, end: string, now: Date): boolean {
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes <= endMinutes) {
      // Same-day window (e.g., 08:00 to 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight window (e.g., 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Deliver queued notifications for users whose quiet hours have ended.
   * Called by the scheduler service.
   */
  async deliverQueuedNotifications(userId: string) {
    const isQuiet = await this.isWithinQuietHours(userId);
    if (isQuiet) return; // Still in quiet hours, skip

    // Get unread notifications that haven't been pushed via socket
    // Since all notifications are stored in DB immediately, we just need to
    // emit the unread count to trigger the client to refresh
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    if (unreadCount > 0) {
      this.notificationGateway.emitUnreadCount(userId, unreadCount);
    }
  }

  /** Get notification preferences */
  async getPreferences(userId: string) {
    let pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) {
      pref = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }
    return pref;
  }

  /** Update notification preferences */
  async updatePreferences(
    userId: string,
    data: Partial<{
      deadlineReminder: boolean;
      budgetAlert: boolean;
      streakReminder: boolean;
      idleReminder: boolean;
      weeklyRecap: boolean;
      forumReply: boolean;
      qnaAnswer: boolean;
      achievementAlert: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
    }>,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
