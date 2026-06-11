import { Module } from '@nestjs/common';
import { InsightController } from './insight.controller';
import { InsightService } from './insight.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [InsightController],
  providers: [InsightService],
})
export class InsightModule {}
