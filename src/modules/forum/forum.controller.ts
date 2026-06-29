import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ForumService } from './forum.service';
import { ForumGateway } from './forum.gateway';
import { CreatePostDto, CreateReplyDto, CreateDiscussionDto, UpdateDiscussionDto } from './dto/forum.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FileSizeGuard } from '../../common/guards/file-size.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('forum')
@UseGuards(AuthGuard, FileSizeGuard)
export class ForumController {
  constructor(
    private readonly forumService: ForumService,
    private readonly forumGateway: ForumGateway,
  ) {}

  @Get('class/:classId')
  getClassPosts(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Query('discussionId') discussionId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.forumService.getClassPosts(classId, user.id, discussionId || undefined, {
      page: page ? parseInt(page) : 1,
      limit: limit ? Math.min(parseInt(limit), 50) : 10,
    });
  }

  @Post('class/:classId')
  async createPost(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: CreatePostDto,
  ) {
    const post = await this.forumService.createPost(classId, user.id, dto);
    this.forumGateway.emitNewPost(classId, post);
    return post;
  }

  @Get('post/:postId')
  getPostDetail(
    @Param('postId', ParseUUIDPipe) postId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.getPostDetail(postId, user.id);
  }

  @Post('post/:postId/reply')
  async replyToPost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @GetUser() user: User,
    @Body() dto: CreateReplyDto,
  ) {
    const result = await this.forumService.replyToPost(postId, user.id, dto);
    // Get the post to find classId for the room
    const post = await this.forumService.getPostDetail(postId, user.id);
    if (post?.classId) {
      this.forumGateway.emitNewReply(post.classId, postId, result);
    }
    return result;
  }

  @Post('vote')
  async vote(
    @GetUser() user: User,
    @Body() body: { postId?: string; replyId?: string; value: number },
  ) {
    const result = await this.forumService.vote(user.id, body.postId || null, body.replyId || null, body.value);
    return result;
  }

  @Delete('post/:postId')
  async deletePost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @GetUser() user: User,
  ) {
    const result = await this.forumService.deletePost(postId, user.id);
    return result;
  }

  @Delete('reply/:replyId')
  deleteReply(
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.deleteReply(replyId, user.id);
  }

  @Patch('post/:postId/pin')
  togglePin(
    @Param('postId', ParseUUIDPipe) postId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.togglePinPost(postId, user.id);
  }

  @Post('poll/vote/:optionId')
  votePoll(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.votePoll(optionId, user.id);
  }

  @Get('attachments/class/:classId')
  getClassAttachments(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.getClassAttachments(classId, user.id);
  }

  @Post('attachment')
  addAttachment(
    @GetUser() user: User,
    @Body() body: { postId?: string; replyId?: string; fileName: string; fileUrl: string; fileType: string; fileSizeBytes?: number },
  ) {
    return this.forumService.addAttachment(
      body.postId || null,
      body.replyId || null,
      { fileName: body.fileName, fileUrl: body.fileUrl, fileType: body.fileType, fileSizeBytes: body.fileSizeBytes, uploaderName: user.fullName },
    );
  }

  @Post('upload/:classId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadForumFile(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.forumService.uploadForumFile(classId, user.id, file);
  }

  // ─── Discussions (Pembahasan) ───────────────────────────────────────
  @Get('discussions/class/:classId')
  getClassDiscussions(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.getClassDiscussions(classId, user.id);
  }

  @Post('discussions/class/:classId')
  createDiscussion(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body() dto: CreateDiscussionDto,
  ) {
    return this.forumService.createDiscussion(classId, user.id, dto);
  }

  @Delete('discussions/:discussionId')
  deleteDiscussion(
    @Param('discussionId', ParseUUIDPipe) discussionId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.deleteDiscussion(discussionId, user.id);
  }

  @Patch('discussions/:discussionId')
  updateDiscussion(
    @Param('discussionId', ParseUUIDPipe) discussionId: string,
    @GetUser() user: User,
    @Body() dto: UpdateDiscussionDto,
  ) {
    return this.forumService.updateDiscussion(discussionId, user.id, dto);
  }

  // ── UNREAD TRACKING ──

  @Post('read/:classId')
  markAsRead(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
    @Body('discussionId') discussionId?: string,
  ) {
    return this.forumService.markAsRead(classId, user.id, discussionId ?? null);
  }

  @Get('unread/:classId')
  getUnreadCounts(
    @Param('classId', ParseUUIDPipe) classId: string,
    @GetUser() user: User,
  ) {
    return this.forumService.getUnreadCounts(classId, user.id);
  }
}
