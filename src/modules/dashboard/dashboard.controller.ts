import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
