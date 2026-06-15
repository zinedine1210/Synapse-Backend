import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { WebPushService } from './web-push.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly webPushService: WebPushService,
  ) {}

  /**
   * GET /notifications
   * Paginated notifications with optional category filter.
   * Query params: page (default 1), limit (default 20), category (optional)
   */
  @Get()
  getMyNotifications(
    @GetUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.notificationService.getUserNotifications(user.id, {
      page: page ? parseInt(page) : 1,
      limit: limit ? Math.min(parseInt(limit), 100) : 10,
      category: category || undefined,
    });
  }

  /**
   * PATCH /notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.notificationService.markAsRead(id, user.id);
  }

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read for current user.
   */
  @Patch('read-all')
  markAllAsRead(@GetUser() user: User) {
    return this.notificationService.markAllAsRead(user.id);
  }

  /**
   * GET /notifications/unread-count
   * Returns { count: number } for badge display.
   */
  @Get('unread-count')
  getUnreadCount(@GetUser() user: User) {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Get('preferences')
  getPreferences(@GetUser() user: User) {
    return this.notificationService.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(@GetUser() user: User, @Body() body: any) {
    return this.notificationService.updatePreferences(user.id, body);
  }

  // ─── Push Subscription Endpoints ─────────────────────────────────────

  /**
   * POST /notifications/push/subscribe
   * Register a push subscription for the current user.
   */
  @Post('push/subscribe')
  async pushSubscribe(
    @GetUser() user: User,
    @Body() body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!body?.subscription?.endpoint || !body?.subscription?.keys?.p256dh || !body?.subscription?.keys?.auth) {
      throw new BadRequestException('Invalid subscription object — endpoint, p256dh, dan auth wajib diisi.');
    }
    await this.webPushService.subscribe(user.id, body.subscription, userAgent);
    return { success: true };
  }

  /**
   * DELETE /notifications/push/unsubscribe
   * Remove a push subscription.
   */
  @Delete('push/unsubscribe')
  async pushUnsubscribe(
    @GetUser() user: User,
    @Body() body: { endpoint: string },
  ) {
    if (!body?.endpoint) {
      throw new BadRequestException('Endpoint wajib diisi.');
    }
    await this.webPushService.unsubscribe(user.id, body.endpoint);
    return { success: true };
  }

  /**
   * GET /notifications/push/vapid-key
   * Returns the VAPID public key for client-side subscription.
   */
  @Get('push/vapid-key')
  getVapidKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
      enabled: this.webPushService.isEnabled(),
    };
  }
}
