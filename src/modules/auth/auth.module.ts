import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [AuthController, SettingsController],
  providers: [AuthService, SettingsService],
  exports: [AuthService],
})
export class AuthModule {}
