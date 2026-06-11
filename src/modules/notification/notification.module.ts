import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, NotificationSchedulerService],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
