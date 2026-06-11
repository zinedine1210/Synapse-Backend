import { Controller, Get, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getMyNotifications(@GetUser() user: User) {
    return this.notificationService.getUserNotifications(user.id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.notificationService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  markAllAsRead(@GetUser() user: User) {
    return this.notificationService.markAllAsRead(user.id);
  }

  @Get('preferences')
  getPreferences(@GetUser() user: User) {
    return this.notificationService.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(@GetUser() user: User, @Body() body: any) {
    return this.notificationService.updatePreferences(user.id, body);
  }
}
