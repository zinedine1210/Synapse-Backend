import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TaskService } from './task.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('task')
@UseGuards(AuthGuard)
export class TaskController {
  constructor(private readonly svc: TaskService) {}

  @Get('class/:classId')
  getClassTasks(@Param('classId', ParseUUIDPipe) classId: string, @GetUser() user: User) {
    return this.svc.getClassTasks(classId, user.id);
  }

  @Get('session/:sessionId')
  getSessionTasks(@Param('sessionId', ParseUUIDPipe) sessionId: string, @GetUser() user: User) {
    return this.svc.getSessionTasks(sessionId, user.id);
  }

  @Get('my-deadlines')
  getMyDeadlines(@GetUser() user: User) {
    return this.svc.myDeadlines(user.id);
  }

  @Post('class/:classId')
  createTask(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() body: {
      title: string;
      description?: string;
      sessionId?: string;
      taskType?: string;
      deadline?: string;
      taskGroupId?: string;
      visibility?: string;
      assignType?: string;
      assignedUserIds?: string[];
      imageBase64?: string;
      imageMimeType?: string;
    },
  ) {
    return this.svc.createTask(classId, user.id, body);
  }

  @Delete(':taskId')
  deleteTask(@Param('taskId', ParseUUIDPipe) taskId: string, @GetUser() user: User) {
    return this.svc.deleteTask(taskId, user.id);
  }

  @Patch(':taskId')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @GetUser() user: User,
    @Body() body: {
      title?: string;
      description?: string;
      sessionId?: string;
      taskType?: string;
      deadline?: string;
      taskGroupId?: string;
      visibility?: string;
      assignType?: string;
      assignedUserIds?: string[];
    },
  ) {
    return this.svc.updateTask(taskId, user.id, body);
  }

  @Post(':taskId/submit')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  submitTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @GetUser() user: User,
    @Body() body: { content?: string; imageUrl?: string; imageBase64?: string; imageMimeType?: string; visibility?: string; skipAi?: boolean },
  ) {
    return this.svc.submitTask(taskId, user.id, body);
  }

  @Patch('submission/:submissionId/visibility')
  toggleSubmissionVisibility(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @GetUser() user: User,
  ) {
    return this.svc.toggleSubmissionVisibility(submissionId, user.id);
  }

  @Get(':taskId/submissions')
  getSubmissions(@Param('taskId', ParseUUIDPipe) taskId: string, @GetUser() user: User) {
    return this.svc.getSubmissions(taskId, user.id);
  }

  @Delete('submission/:submissionId')
  deleteSubmission(@Param('submissionId', ParseUUIDPipe) submissionId: string, @GetUser() user: User) {
    return this.svc.deleteSubmission(submissionId, user.id);
  }
}
