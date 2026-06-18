import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { AiModule } from '../ai/ai.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [AiModule, NotificationModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
