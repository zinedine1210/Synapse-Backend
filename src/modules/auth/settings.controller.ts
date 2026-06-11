import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { UpdateSettingsProfileDto } from './dto/update-settings-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateQuietHoursDto } from './dto/update-quiet-hours.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * PATCH /api/v1/settings/profile
   * Update fullName and/or avatarUrl.
   */
  @Patch('profile')
  updateProfile(
    @GetUser() user: User,
    @Body() dto: UpdateSettingsProfileDto,
  ) {
    return this.settingsService.updateProfile(user.id, dto);
  }

  /**
   * GET /api/v1/settings/preferences
   * Get all user preferences (notification toggles, theme, language, quiet hours).
   */
  @Get('preferences')
  getPreferences(@GetUser() user: User) {
    return this.settingsService.getPreferences(user.id);
  }

  /**
   * PATCH /api/v1/settings/preferences
   * Update notification toggles, theme, and/or language.
   */
  @Patch('preferences')
  updatePreferences(
    @GetUser() user: User,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.settingsService.updatePreferences(user.id, dto);
  }

  /**
   * PATCH /api/v1/settings/quiet-hours
   * Set quiet hours window (start/end time).
   */
  @Patch('quiet-hours')
  updateQuietHours(
    @GetUser() user: User,
    @Body() dto: UpdateQuietHoursDto,
  ) {
    return this.settingsService.updateQuietHours(user.id, dto);
  }

  /**
   * POST /api/v1/settings/export-data
   * Generate CSV export of all transactions + todos.
   * Rate limited to 1 request per hour per user.
   */
  @Post('export-data')
  exportData(@GetUser() user: User) {
    return this.settingsService.exportData(user.id);
  }

  /**
   * POST /api/v1/settings/delete-account
   * Soft delete account with double-confirmation.
   * User must send confirmationText = "HAPUS AKUN".
   */
  @Post('delete-account')
  deleteAccount(
    @GetUser() user: User,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.settingsService.deleteAccount(user.id, dto);
  }
}
