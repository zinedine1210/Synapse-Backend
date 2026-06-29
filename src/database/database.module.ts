import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AiUsageService } from '../common/services/ai-usage.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Global()
@Module({
  providers: [PrismaService, AiUsageService, AuthGuard],
  exports: [PrismaService, AiUsageService, AuthGuard],
})
export class DatabaseModule {}
