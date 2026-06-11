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
  ) {
    return this.svc.getAll(user.id, { status, priority, category });
  }

  @Get('stats')
  getStats(@GetUser() user: User) {
    return this.svc.getStats(user.id);
  }

  @Get('unified-timeline')
  getUnifiedTimeline(@GetUser() user: User) {
    return this.svc.getUnifiedTimeline(user.id);
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
}
