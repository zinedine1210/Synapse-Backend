import { Module } from '@nestjs/common';
import { FoodRecommendController } from './food-recommend.controller';
import { FoodRecommendService } from './food-recommend.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [FoodRecommendController],
  providers: [FoodRecommendService],
})
export class FoodRecommendModule {}
