import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { DatabaseModule } from '../../database/database.module';
import { AiRateLimitGuard } from '../../common/guards/ai-rate-limit.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AiController],
  providers: [AiService, AiRateLimitGuard],
  exports: [AiService],
})
export class AiModule {}
