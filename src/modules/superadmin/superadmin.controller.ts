import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SuperadminService } from './superadmin.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdatePlanConfigDto } from './dto/update-plan-config.dto';
import { CreatePricingPlanDto } from './dto/create-pricing-plan.dto';
import { UpdatePricingPlanDto } from './dto/update-pricing-plan.dto';

@Controller('superadmin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@Throttle({ default: { ttl: 60000, limit: 30 } })
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  /** GET /api/v1/superadmin/analytics – Dashboard analitik sistem */
  @Get('analytics')
  getAnalytics() {
    return this.superadminService.getSystemAnalytics();
  }

  /** GET /api/v1/superadmin/users – Daftar seluruh user */
  @Get('users')
  getAllUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.superadminService.getAllUsers(Number(page) || 1, Math.min(Number(limit) || 50, 100));
  }

  /** GET /api/v1/superadmin/plan-config – Daftar konfigurasi plan */
  @Get('plan-config')
  getPlanConfigs() {
    return this.superadminService.getPlanConfigs();
  }

  /** PATCH /api/v1/superadmin/plan-config/:plan – Update kuota per plan */
  @Patch('plan-config/:plan')
  updatePlanConfig(
    @Param('plan') plan: string,
    @Body() dto: UpdatePlanConfigDto,
  ) {
    return this.superadminService.updatePlanConfig(plan, dto);
  }

  /** POST /api/v1/superadmin/plans – Buat plan baru */
  @Post('plans')
  createPlan(@Body() dto: CreatePricingPlanDto) {
    return this.superadminService.createPricingPlan(dto);
  }

  /** PATCH /api/v1/superadmin/plans/:id – Update plan */
  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePricingPlanDto) {
    return this.superadminService.updatePricingPlan(id, dto);
  }

  /** DELETE /api/v1/superadmin/plans/:id – Hapus plan */
  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.superadminService.deletePricingPlan(id);
  }

  /** PATCH /api/v1/superadmin/users/:userId/plan – Assign plan ke user */
  @Patch('users/:userId/plan')
  assignUserPlan(
    @Param('userId') userId: string,
    @Body('planName') planName: string,
  ) {
    return this.superadminService.assignUserPlan(userId, planName);
  }

  /** GET /api/v1/superadmin/classes – Semua kelas di sistem */
  @Get('classes')
  getAllClasses(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.superadminService.getAllClasses(Number(page) || 1, Math.min(Number(limit) || 50, 100));
  }

  /** DELETE /api/v1/superadmin/classes/:id – Hapus kelas */
  @Delete('classes/:id')
  deleteClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.superadminService.deleteClass(id);
  }

  /** GET /api/v1/superadmin/forum-stats – Statistik forum */
  @Get('forum-stats')
  getForumStats() {
    return this.superadminService.getForumStats();
  }

  /** GET /api/v1/superadmin/academic-stats – Statistik akademik */
  @Get('academic-stats')
  getAcademicStats() {
    return this.superadminService.getAcademicStats();
  }

  /** GET /api/v1/superadmin/duit-tracker-stats – Statistik duit tracker */
  @Get('duit-tracker-stats')
  getDuitTrackerStats() {
    return this.superadminService.getDuitTrackerStats();
  }

  /** GET /api/v1/superadmin/gamification-stats – Statistik gamifikasi */
  @Get('gamification-stats')
  getGamificationStats() {
    return this.superadminService.getGamificationStats();
  }

  /** GET /api/v1/superadmin/qna-stats – Statistik Q&A */
  @Get('qna-stats')
  getQnaStats() {
    return this.superadminService.getQnaStats();
  }

  /** GET /api/v1/superadmin/system-stats – Statistik sistem */
  @Get('system-stats')
  getSystemStats() {
    return this.superadminService.getSystemStats();
  }
}
