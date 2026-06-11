import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async getUserNotifications(userId: string) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { notifications, unreadCount };
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Semua notifikasi ditandai telah dibaca.' };
  }

  /** Create a notification and emit via socket */
  async createNotification(userId: string, title: string, message: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, message },
    });
    this.notificationGateway.emitNotification(userId, notification);
    // Also update unread count
    const unreadCount = await this.prisma.notification.count({ where: { userId, isRead: false } });
    this.notificationGateway.emitUnreadCount(userId, unreadCount);
    return notification;
  }

  /** Notify all members of a class (except the actor) */
  async notifyClassMembers(classId: string, excludeUserId: string, title: string, message: string) {
    const members = await this.prisma.classMember.findMany({
      where: { classId },
      select: { userId: true },
    });
    const recipientIds = members.map(m => m.userId).filter(id => id !== excludeUserId);
    for (const uid of recipientIds) {
      await this.createNotification(uid, title, message);
    }
  }

  /** Get notification preferences */
  async getPreferences(userId: string) {
    let pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!pref) {
      pref = await this.prisma.notificationPreference.create({ data: { userId } });
    }
    return pref;
  }

  /** Update notification preferences */
  async updatePreferences(userId: string, data: Partial<{
    deadlineReminder: boolean;
    budgetAlert: boolean;
    streakReminder: boolean;
    idleReminder: boolean;
    weeklyRecap: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  }>) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
