import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AiUsageService } from '../common/services/ai-usage.service';

@Global()
@Module({
  providers: [PrismaService, AiUsageService],
  exports: [PrismaService, AiUsageService],
})
export class DatabaseModule {}
