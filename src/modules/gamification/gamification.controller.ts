import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('gamification')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('profile')
  async getProfile(@GetUser('id') userId: string) {
    return this.gamificationService.getProfile(userId);
  }

  @Get('history')
  async getHistory(
    @GetUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gamificationService.getHistory(
      userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('leaderboard/:classId')
  async getLeaderboard(@Param('classId') classId: string) {
    return this.gamificationService.getLeaderboard(classId);
  }

  @Post('check-streak')
  async checkStreak(@GetUser('id') userId: string) {
    return this.gamificationService.checkStreak(userId);
  }
}
