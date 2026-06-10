import { Controller, Get, Param, ParseUUIDPipe, UseGuards, Post, Patch, Delete, Body } from '@nestjs/common';
import { SessionService } from './session.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreateSessionDto, UpdateSessionDto, ReorderSessionDto } from './dto/session.dto';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  /** GET /api/v1/sessions/:id – Detail satu sesi pertemuan */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.sessionService.findSessionById(id, user.id);
  }

  /** POST /api/v1/sessions/class/:classId - Buat sesi baru */
  @Post('class/:classId')
  create(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionService.createSession(classId, user.id, dto);
  }

  /** PATCH /api/v1/sessions/:id - Update sesi (title) */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.updateSession(id, user.id, dto);
  }

  /** DELETE /api/v1/sessions/:id - Hapus sesi */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.sessionService.deleteSession(id, user.id);
  }

  /** PATCH /api/v1/sessions/:id/reorder - Ubah urutan/sequence sesi */
  @Patch(':id/reorder')
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Body() dto: ReorderSessionDto,
  ) {
    return this.sessionService.reorderSession(id, user.id, dto);
  }
}
