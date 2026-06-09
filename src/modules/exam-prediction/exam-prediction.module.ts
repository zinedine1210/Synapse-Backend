import { Module } from '@nestjs/common';
import { ExamPredictionController } from './exam-prediction.controller';
import { ExamPredictionService } from './exam-prediction.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ExamPredictionController],
  providers: [ExamPredictionService],
  exports: [ExamPredictionService],
})
export class ExamPredictionModule {}
