import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InsightService } from './insight.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('insight')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('ai_insight')
export class InsightController {
  constructor(private readonly svc: InsightService) {}

  @Get('weekly')
  getWeeklySummary(@GetUser() user: User, @Query('range') range?: string) {
    return this.svc.getWeeklySummary(user.id, range);
  }

  @Post('ai')
  getAiInsight(@GetUser() user: User) {
    return this.svc.getAiInsight(user.id);
  }
}
