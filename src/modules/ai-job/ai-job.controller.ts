import { Controller, Get, Post, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AiJobService } from './ai-job.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('ai-jobs')
@UseGuards(AuthGuard)
export class AiJobController {
  constructor(private readonly aiJobService: AiJobService) {}

  @Get('status')
  getStatus(@GetUser() user: User, @Query('type') type: string) {
    if (!type) return null;
    return this.aiJobService.getStatus(user.id, type);
  }

  @Post(':id/dismiss')
  dismiss(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.aiJobService.dismiss(user.id, id);
  }
}
