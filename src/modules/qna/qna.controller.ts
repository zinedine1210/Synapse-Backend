import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { QnaService } from './qna.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreateQuestionDto, CreateAnswerDto, UpdateQuestionDto } from './dto/qna.dto';

@Controller('qna')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('qna_public')
export class QnaController {
  constructor(private readonly svc: QnaService) {}

  @Post('questions')
  createQuestion(@GetUser() user: User, @Body() dto: CreateQuestionDto) {
    return this.svc.createQuestion(user.id, dto);
  }

  @Get('questions')
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
  getMyQuestions(@GetUser() user: User) {
    return this.svc.getMyQuestions(user.id);
  }

  @Get('questions/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.svc.getBySlug(slug);
  }

  @Post('questions/:id/answers')
  createAnswer(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.svc.createAnswer(user.id, id, dto);
  }

  @Patch('answers/:id/approve')
  approveAnswer(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.approveAnswer(user.id, id);
  }

  @Patch('answers/:id/upvote')
  upvoteAnswer(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.upvoteAnswer(user.id, id);
  }

  @Delete('questions/:id')
  deleteQuestion(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteQuestion(user.id, id);
  }

  @Patch('questions/:id')
  editQuestion(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuestionDto) {
    return this.svc.editQuestion(user.id, id, dto);
  }

  @Post('answers/:id/report')
  reportAnswer(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reportAnswer(user.id, id);
  }

  @Get('reputation')
  getReputation(@GetUser() user: User) {
    return this.svc.getReputation(user.id);
  }
}
