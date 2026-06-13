import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  getSummary(@GetUser() user: User) {
    return this.svc.getSummary(user);
  }

  @Get('summary-v2')
  getSummaryV2(@GetUser() user: User) {
    return this.svc.getSummaryV2(user);
  }

  @Get('class-comparison')
  getClassComparison(@GetUser() user: User) {
    return this.svc.getClassComparison(user);
  }

  @Get('trending-qna')
  getTrendingQna() {
    return this.svc.getTrendingQna();
  }

  @Get('todays-briefing')
  getTodaysBriefing(@GetUser() user: User) {
    return this.svc.getTodaysBriefing(user);
  }

  @Get('ai-briefing')
  getAiBriefing(@GetUser() user: User) {
    return this.svc.getAiBriefing(user);
  }

  @Post('ai-briefing')
  generateAiBriefing(@GetUser() user: User) {
    return this.svc.generateAiBriefing(user);
  }
}
