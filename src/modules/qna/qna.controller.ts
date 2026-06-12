import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QnaService } from './qna.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import {
  CreateQuestionDto,
  CreateAnswerDto,
  UpdateQuestionDto,
  ReportAnswerDto,
} from './dto/qna.dto';

@Controller('qna')
export class QnaController {
  constructor(private readonly svc: QnaService) {}

  @Post('questions')
  @UseGuards(AuthGuard, FeatureGuard)
  @RequireFeature('qna_public')
  createQuestion(@GetUser() user: User, @Body() dto: CreateQuestionDto) {
    return this.svc.createQuestion(user.id, dto);
  }

  @Get('questions')
  @UseGuards(OptionalAuthGuard)
  getQuestions(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getQuestions({
      category,
      status,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('questions/my')
  @UseGuards(AuthGuard)
  getMyQuestions(@GetUser() user: User) {
    return this.svc.getMyQuestions(user.id);
  }

  /**
   * GET /qna/questions/trending — Trending questions (7-day upvote window)
   * Must be defined BEFORE :slug to avoid route conflict.
   */
  @Get('questions/trending')
  @UseGuards(OptionalAuthGuard)
  getTrendingQuestions(@Query('limit') limit?: string) {
    return this.svc.getTrendingQuestions(limit ? parseInt(limit) : 10);
  }

  /**
   * GET /qna/questions/:slug — Get question by slug with related questions (max 5)
   */
  @Get('questions/:slug')
  @UseGuards(OptionalAuthGuard)
  getBySlug(@Param('slug') slug: string) {
    return this.svc.getBySlug(slug);
  }

  /**
   * POST /qna/questions/:id/view — Increment view count (no auth required for this action,
   * but since the controller has AuthGuard applied globally, we keep it consistent).
   */
  @Post('questions/:id/view')
  @UseGuards(OptionalAuthGuard)
  incrementViewCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.incrementViewCount(id);
  }

  @Post('questions/:id/answers')
  @UseGuards(AuthGuard, FeatureGuard)
  @RequireFeature('qna_public')
  createAnswer(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.svc.createAnswer(user.id, id, dto);
  }

  @Patch('answers/:id/approve')
  @UseGuards(AuthGuard)
  approveAnswer(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.approveAnswer(user.id, id);
  }

  /**
   * POST /qna/answers/:id/upvote — DB-persisted upvote (insert QnaVote + increment counter)
   */
  @Post('answers/:id/upvote')
  @UseGuards(AuthGuard)
  upvoteAnswer(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.upvoteAnswer(user.id, id);
  }

  /**
   * DELETE /qna/answers/:id/upvote — Remove upvote (delete QnaVote + decrement counter)
   */
  @Delete('answers/:id/upvote')
  @UseGuards(AuthGuard)
  removeUpvote(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.removeUpvote(user.id, id);
  }

  /**
   * POST /qna/answers/:id/report — Report answer (persist to QnaReport + increment reportCount)
   */
  @Post('answers/:id/report')
  @UseGuards(AuthGuard)
  reportAnswer(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportAnswerDto,
  ) {
    return this.svc.reportAnswer(user.id, id, dto.reason);
  }

  @Delete('questions/:id')
  @UseGuards(AuthGuard)
  deleteQuestion(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteQuestion(user.id, id);
  }

  @Patch('questions/:id')
  @UseGuards(AuthGuard)
  editQuestion(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.svc.editQuestion(user.id, id, dto);
  }

  @Get('reputation')
  @UseGuards(AuthGuard)
  getReputation(@GetUser() user: User) {
    return this.svc.getReputation(user.id);
  }
}
