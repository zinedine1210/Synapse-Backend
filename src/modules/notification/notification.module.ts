import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WebPushService } from './web-push.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, NotificationSchedulerService, WebPushService],
  exports: [NotificationService, NotificationGateway, WebPushService],
})
export class NotificationModule {}
