import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { BriefingService } from './briefing.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('briefing')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('daily_briefing')
export class BriefingController {
  constructor(private readonly svc: BriefingService) {}

  @Get('today')
  getTodayBriefing(@GetUser() user: User) {
    return this.svc.getTodayBriefing(user.id);
  }

  @Post('refresh')
  refreshBriefing(@GetUser() user: User) {
    return this.svc.refreshBriefing(user.id);
  }

  @Get('history')
  getHistory(@GetUser() user: User, @Query('limit') limit?: string) {
    return this.svc.getHistory(user.id, limit ? parseInt(limit) : 7);
  }
}
