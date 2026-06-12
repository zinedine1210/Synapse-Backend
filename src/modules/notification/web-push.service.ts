import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@synapse.app';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
      this.logger.log('Web Push enabled with VAPID keys');
    } else {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Save or update a push subscription for a user */
  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: subscription.endpoint },
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
      },
    });
  }

  /** Remove a push subscription */
  async unsubscribe(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  /** Send a push notification to all of a user's subscribed devices */
  async sendPushToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; icon?: string },
  ) {
    if (!this.enabled) return;

    // Check if user has push enabled in preferences
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (pref && pref.pushEnabled === false) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/notifications',
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload,
          );
        } catch (error: any) {
          // 410 Gone or 404 = subscription expired, remove it
          if (error?.statusCode === 410 || error?.statusCode === 404) {
            this.logger.debug(`Removing expired subscription ${sub.id}`);
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            }).catch(() => {});
          } else {
            this.logger.warn(
              `Push failed for subscription ${sub.id}: ${error?.message || error}`,
            );
          }
          throw error;
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (sent > 0 || failed > 0) {
      this.logger.debug(
        `Push to user ${userId}: ${sent} sent, ${failed} failed`,
      );
    }
  }
}
