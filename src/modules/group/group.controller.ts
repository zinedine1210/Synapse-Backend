import { Controller, Get, Post, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { GroupService } from './group.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('group')
@UseGuards(AuthGuard)
export class GroupController {
  constructor(private readonly svc: GroupService) {}

  @Get('class/:classId')
  getClassGroups(@Param('classId', ParseUUIDPipe) classId: string, @GetUser() user: User) {
    return this.svc.getClassGroups(classId, user.id);
  }

  @Post('class/:classId')
  createGroup(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() body: { name: string },
  ) {
    return this.svc.createGroup(classId, user.id, body.name);
  }

  @Post('class/:classId/auto')
  autoGenerate(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() body: { groupCount: number },
  ) {
    return this.svc.autoGenerate(classId, user.id, body.groupCount);
  }

  @Delete(':groupId')
  deleteGroup(@Param('groupId', ParseUUIDPipe) groupId: string, @GetUser() user: User) {
    return this.svc.deleteGroup(groupId, user.id);
  }

  @Post(':groupId/member')
  addMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @GetUser() user: User,
    @Body() body: { userId: string },
  ) {
    return this.svc.addMember(groupId, body.userId, user.id);
  }

  @Delete(':groupId/member/:targetUserId')
  removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
    @GetUser() user: User,
  ) {
    return this.svc.removeMember(groupId, targetUserId, user.id);
  }
}
