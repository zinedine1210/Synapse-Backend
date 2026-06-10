import { Module } from '@nestjs/common';
import { DuitTrackerController } from './duit-tracker.controller';
import { DuitTrackerService } from './duit-tracker.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [DuitTrackerController],
  providers: [DuitTrackerService],
})
export class DuitTrackerModule {}
