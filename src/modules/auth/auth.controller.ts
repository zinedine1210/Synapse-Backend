import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/sync-user
   * Dipanggil setelah user registrasi/login pertama kali via Supabase.
   * Sinkronisasi data user ke tabel lokal kita.
   */
  @Post('sync-user')
  @UseGuards(AuthGuard)
  syncUser(@GetUser() user: User, @Body() dto: SyncUserDto) {
    return this.authService.syncUser(user.id, dto);
  }

  /**
   * GET /api/v1/auth/me
   * Mendapatkan data profil user lokal (termasuk role & plan).
   */
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@GetUser() user: User) {
    // Strip sensitive fields before returning
    const { pricingPlan, ...safeUser } = user as any;
    return {
      ...safeUser,
      pricingPlan: pricingPlan ? {
        name: pricingPlan.name,
        features: pricingPlan.features,
        maxUploadPerMonth: pricingPlan.maxUploadPerMonth,
        maxFileSizeMb: pricingPlan.maxFileSizeMb,
        aiRequestLimit: pricingPlan.aiRequestLimit,
      } : null,
    };
  }
}
