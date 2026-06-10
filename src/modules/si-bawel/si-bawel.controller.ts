import { Controller, Get, Post, Patch, Body, UseGuards } from '@nestjs/common';
import { SiBawelService } from './si-bawel.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { UpdateBawelSettingDto } from './dto/update-setting.dto';

@Controller('si-bawel')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('si_bawel')
export class SiBawelController {
  constructor(private readonly svc: SiBawelService) {}

  @Get('setting')
  getSetting(@GetUser() user: User) {
    return this.svc.getSetting(user.id);
  }

  @Patch('setting')
  updateSetting(@GetUser() user: User, @Body() dto: UpdateBawelSettingDto) {
    return this.svc.updateSetting(user.id, dto);
  }

  @Post('chat')
  chat(@GetUser() user: User, @Body('message') message: string) {
    return this.svc.chat(user.id, message);
  }

  @Get('weekly-roast')
  getWeeklyRoast(@GetUser() user: User) {
    return this.svc.getWeeklyRoast(user.id);
  }
}
