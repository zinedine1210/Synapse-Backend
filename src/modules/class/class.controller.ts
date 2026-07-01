import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { FileSizeGuard } from '../../common/guards/file-size.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('classes')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('class')
export class ClassController {
  constructor(private readonly classService: ClassService) {}

  /** GET /api/v1/classes – Daftar kelas milik/diikuti user */
  @Get()
  findMyClasses(@GetUser() user: User) {
    return this.classService.findUserClasses(user.id);
  }

  /** POST /api/v1/classes – Buat kelas baru */
  @Post()
  createClass(@GetUser() user: User, @Body() dto: CreateClassDto) {
    return this.classService.createClass(user.id, dto);
  }

  /** POST /api/v1/classes/resolve-code – Resolve class code to UUID */
  @Post('resolve-code')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  resolveCode(@Body('code') code: string) {
    return this.classService.resolveClassCode(code);
  }

  /** GET /api/v1/classes/:id – Detail satu kelas */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.findClassById(id, user.id);
  }

  /** PATCH /api/v1/classes/:id – Update info kelas */
  @Patch(':id')
  updateClass(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classService.updateClass(id, user.id, dto);
  }

  /** GET /api/v1/classes/:id/sessions – pertemuan kelas */
  @Get(':id/sessions')
  getSessions(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.getClassSessions(id, user.id);
  }

  /** GET /api/v1/classes/:id/info – Info dasar kelas (untuk join) */
  @Get(':id/info')
  getClassInfo(@Param('id', ParseUUIDPipe) id: string) {
    return this.classService.findClassInfo(id);
  }

  /** POST /api/v1/classes/:id/join – Bergabung ke kelas */
  @Post(':id/join')
  joinClass(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('password') password?: string,
  ) {
    return this.classService.joinClass(id, user.id, password);
  }

  /** POST /api/v1/classes/:id/members - Tambah anggota kelas (hanya owner) */
  @Post(':id/members')
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body('email') email: string,
  ) {
    return this.classService.addMemberByEmail(id, user.id, email);
  }

  /** DELETE /api/v1/classes/:id/members/:userId - Kick anggota kelas (hanya owner) */
  @Delete(':id/members/:userId')
  kickMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userIdToKick: string,
    @GetUser() user: User,
  ) {
    return this.classService.kickMember(id, user.id, userIdToKick);
  }

  /** PATCH /api/v1/classes/:id/members/:userId/role - Update role anggota (hanya owner) */
  @Patch(':id/members/:userId/role')
  updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @GetUser() user: User,
    @Body('role') role: string,
  ) {
    return this.classService.updateMemberRole(id, user.id, targetUserId, role);
  }

  /** GET /api/v1/classes/:id/members – Daftar anggota kelas */
  @Get(':id/members')
  getClassMembers(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.getClassMembers(id, user.id);
  }

  /** GET /api/v1/classes/:id/materials – Ambil semua materi dalam kelas */
  @Get(':id/materials')
  getAllClassMaterials(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.getAllClassMaterials(id, user.id);
  }

  /** DELETE /api/v1/classes/:id – Hapus kelas (hanya owner) */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.deleteClass(id, user.id);
  }

  /** POST /api/v1/classes/join-by-code – Bergabung via kode */
  @Post('join-by-code')
  joinByCode(
    @GetUser() user: User,
    @Body('code') code: string,
    @Body('password') password?: string,
  ) {
    return this.classService.joinByCode(code, user.id, password);
  }

  /** GET /api/v1/classes/code-info/:code – Info kelas via kode */
  @Get('code-info/:code')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  getClassInfoByCode(@Param('code') code: string) {
    return this.classService.getClassInfoByCode(code);
  }

  // ── CUSTOM TABS ENDPOINTS ──

  @Get(':id/custom-tabs')
  getCustomTabs(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Query('discussionId') discussionId?: string,
  ) {
    // discussionId = 'null' means Umum (null in DB), undefined means all
    const discId = discussionId === 'null' ? null : discussionId;
    return this.classService.getCustomTabs(id, user.id, discId);
  }

  @Post(':id/custom-tabs')
  createCustomTab(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: { name: string; discussionId?: string | null },
  ) {
    return this.classService.createCustomTab(id, user.id, body.name, body.discussionId);
  }

  @Patch('custom-tabs/:tabId')
  updateCustomTab(
    @Param('tabId', ParseUUIDPipe) tabId: string,
    @GetUser() user: User,
    @Body() body: { name?: string; content?: string },
  ) {
    return this.classService.updateCustomTab(tabId, user.id, body.name, body.content);
  }

  @Delete('custom-tabs/:tabId')
  deleteCustomTab(
    @Param('tabId', ParseUUIDPipe) tabId: string,
    @GetUser() user: User,
  ) {
    return this.classService.deleteCustomTab(tabId, user.id);
  }

  @Post('custom-tabs/:tabId/files')
  @UseGuards(FileSizeGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadCustomTabFile(
    @Param('tabId', ParseUUIDPipe) tabId: string,
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.classService.uploadCustomTabFile(tabId, user.id, file);
  }

  @Delete('custom-tab-files/:fileId')
  deleteCustomTabFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @GetUser() user: User,
  ) {
    return this.classService.deleteCustomTabFile(fileId, user.id);
  }

  // ── CLASS ROLES ENDPOINTS ──

  /** GET /api/v1/classes/permissions – List all available permissions */
  @Get('permissions')
  getPermissions() {
    return this.classService.getPermissions();
  }

  /** GET /api/v1/classes/:id/roles – List roles for a class */
  @Get(':id/roles')
  getClassRoles(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.getClassRoles(id, user.id);
  }

  /** POST /api/v1/classes/:id/roles – Create a new class role */
  @Post(':id/roles')
  createClassRole(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: { name: string; permissions: string[] },
  ) {
    return this.classService.createClassRole(id, user.id, body.name, body.permissions);
  }

  /** PATCH /api/v1/classes/:id/roles/:roleId – Update a class role */
  @Patch(':id/roles/:roleId')
  updateClassRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @GetUser() user: User,
    @Body() body: { name?: string; permissions?: string[] },
  ) {
    return this.classService.updateClassRole(id, user.id, roleId, body);
  }

  /** DELETE /api/v1/classes/:id/roles/:roleId – Delete a class role */
  @Delete(':id/roles/:roleId')
  deleteClassRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @GetUser() user: User,
  ) {
    return this.classService.deleteClassRole(id, user.id, roleId);
  }

  /** PATCH /api/v1/classes/:id/members/:userId/class-role – Assign class role to member */
  @Patch(':id/members/:userId/class-role')
  assignClassRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @GetUser() user: User,
    @Body('classRoleId') classRoleId: string | null,
  ) {
    return this.classService.assignClassRole(id, user.id, targetUserId, classRoleId);
  }

  // ── JOIN APPROVAL ENDPOINTS ──

  /** GET /api/v1/classes/:id/pending-members – List pending join requests */
  @Get(':id/pending-members')
  getPendingMembers(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.classService.getPendingMembers(id, user.id);
  }

  /** POST /api/v1/classes/:id/approve/:userId – Approve pending member */
  @Post(':id/approve/:userId')
  approveMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @GetUser() user: User,
  ) {
    return this.classService.approveMember(id, user.id, targetUserId);
  }

  /** POST /api/v1/classes/:id/reject/:userId – Reject pending member */
  @Post(':id/reject/:userId')
  rejectMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @GetUser() user: User,
  ) {
    return this.classService.rejectMember(id, user.id, targetUserId);
  }

  /** PATCH /api/v1/classes/:id/settings – Update class join settings */
  @Patch(':id/settings')
  updateClassSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() body: { joinMode?: string; autoRoleAssign?: boolean },
  ) {
    return this.classService.updateClassSettings(id, user.id, body);
  }
}
