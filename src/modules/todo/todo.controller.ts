import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { TodoService } from './todo.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';
import { ReorderTodosDto } from './dto/reorder-todo.dto';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtask.dto';
import { SetRecurrenceDto } from './dto/recurrence.dto';

@Controller('todos')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('todo_list')
export class TodoController {
  constructor(private readonly svc: TodoService) {}

  @Post()
  create(@GetUser() user: User, @Body() dto: CreateTodoDto) {
    return this.svc.create(user.id, dto);
  }

  @Get()
  getAll(
    @GetUser() user: User,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getAll(user.id, {
      status, priority, category, type,
      page: page ? parseInt(page) : 1,
      limit: limit ? Math.min(parseInt(limit), 100) : 10,
    });
  }

  @Get('stats')
  getStats(@GetUser() user: User) {
    return this.svc.getStats(user.id);
  }

  @Get('agenda')
  getAgenda(@GetUser() user: User, @Query('days') days?: string) {
    return this.svc.getAgenda(user.id, days ? Math.min(parseInt(days), 30) : 7);
  }

  @Post('check-conflicts')
  checkConflicts(
    @GetUser() user: User,
    @Body('date') date: string,
    @Body('startTime') startTime: string,
    @Body('endTime') endTime: string,
    @Body('excludeId') excludeId?: string,
  ) {
    return this.svc.checkConflicts(user.id, date, startTime, endTime, excludeId);
  }

  @Get('unified-timeline')
  getUnifiedTimeline(@GetUser() user: User) {
    return this.svc.getUnifiedTimeline(user.id);
  }

  @Get('shared/with-me')
  getSharedWithMe(@GetUser() user: User) {
    return this.svc.getSharedWithMe(user.id);
  }

  @Post('shared/:shareId/respond')
  respondToShare(
    @GetUser() user: User,
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Body('accept') accept: boolean,
  ) {
    return this.svc.respondToShare(user.id, shareId, accept);
  }

  @Patch('reorder')
  reorder(@GetUser() user: User, @Body() dto: ReorderTodosDto) {
    return this.svc.reorder(user.id, dto);
  }

  @Get(':id')
  getById(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getById(user.id, id);
  }

  @Patch(':id')
  update(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTodoDto) {
    return this.svc.update(user.id, id, dto);
  }

  @Patch(':id/toggle')
  toggleDone(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.toggleDone(user.id, id);
  }

  @Delete(':id')
  delete(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.delete(user.id, id);
  }

  @Post('parse')
  parseNaturalInput(@GetUser() user: User, @Body('text') text: string) {
    return this.svc.parseNaturalInput(user.id, text);
  }

  // ==============================
  // Subtask endpoints
  // ==============================

  @Post(':id/subtasks')
  createSubtask(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.svc.createSubtask(user.id, id, dto);
  }

  @Patch(':id/subtasks/:subId')
  updateSubtask(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subId', ParseUUIDPipe) subId: string,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.svc.updateSubtask(user.id, id, subId, dto);
  }

  @Delete(':id/subtasks/:subId')
  deleteSubtask(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subId', ParseUUIDPipe) subId: string,
  ) {
    return this.svc.deleteSubtask(user.id, id, subId);
  }

  // ==============================
  // Recurrence endpoint
  // ==============================

  @Post(':id/recurrence')
  setRecurrence(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecurrenceDto,
  ) {
    return this.svc.setRecurrence(user.id, id, dto);
  }

  // ==============================
  // Bulk operations
  // ==============================

  @Post('bulk/delete')
  bulkDelete(@GetUser() user: User, @Body('ids') ids: string[]) {
    return this.svc.bulkDelete(user.id, ids);
  }

  @Post('bulk/toggle')
  bulkToggleDone(@GetUser() user: User, @Body('ids') ids: string[], @Body('done') done: boolean) {
    return this.svc.bulkToggleDone(user.id, ids, done);
  }

  @Post('bulk/category')
  bulkUpdateCategory(@GetUser() user: User, @Body('ids') ids: string[], @Body('category') category: string) {
    return this.svc.bulkUpdateCategory(user.id, ids, category);
  }

  @Post('bulk/priority')
  bulkUpdatePriority(@GetUser() user: User, @Body('ids') ids: string[], @Body('priority') priority: string) {
    return this.svc.bulkUpdatePriority(user.id, ids, priority);
  }

  // ==============================
  // Reminder endpoints
  // ==============================

  @Post(':id/reminder')
  setReminder(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('remindAt') remindAt: string,
  ) {
    return this.svc.setReminder(user.id, id, new Date(remindAt));
  }

  @Delete(':id/reminder')
  deleteReminder(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteReminder(user.id, id);
  }

  // ==============================
  // Sync & Bulk AI endpoints
  // ==============================

  @Post('sync-class-tasks')
  syncClassTasks(@GetUser() user: User) {
    return this.svc.syncClassTasks(user.id);
  }

  @Post('parse-image')
  parseImage(
    @GetUser() user: User,
    @Body('imageBase64') imageBase64: string,
    @Body('mimeType') mimeType: string,
  ) {
    return this.svc.parseBulkImage(user.id, imageBase64, mimeType);
  }

  @Post('bulk/create')
  bulkCreate(@GetUser() user: User, @Body('items') items: any[]) {
    return this.svc.bulkCreate(user.id, items);
  }

  // ==============================
  // Sharing endpoints
  // ==============================

  @Post(':id/share')
  shareTodo(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('email') email: string,
    @Body('role') role?: string,
  ) {
    return this.svc.shareTodo(user.id, id, email, role || 'viewer');
  }

  @Get(':id/shared-users')
  getSharedUsers(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getSharedUsers(user.id, id);
  }

  @Delete(':id/share/:targetUserId')
  unshareTodo(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.svc.unshareTodo(user.id, id, targetUserId);
  }
}
