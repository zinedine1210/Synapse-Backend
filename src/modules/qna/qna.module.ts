import { Module } from '@nestjs/common';
import { QnaController } from './qna.controller';
import { QnaService } from './qna.service';
import { DatabaseModule } from '../../database/database.module';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, GamificationModule, NotificationModule],
  controllers: [QnaController],
  providers: [QnaService],
})
export class QnaModule {}
