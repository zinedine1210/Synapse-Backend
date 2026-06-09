import { Module } from '@nestjs/common';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ForumGateway } from './forum.gateway';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [ForumController],
  providers: [ForumService, ForumGateway],
  exports: [ForumGateway],
})
export class ForumModule {}
