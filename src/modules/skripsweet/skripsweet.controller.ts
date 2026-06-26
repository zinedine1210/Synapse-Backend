import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { SkripsweetService } from './skripsweet.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import {
  CreateThesisDto, UpdateThesisDto, SetFormatTemplateDto, ExplainFormatDto,
  CreateChapterDto, UpdateChapterDto, AddJournalDto, SearchJournalDto,
  CreateBimbinganDto, UpdateBimbinganDto, ThesisChatDto, AiWriteAssistDto,
  GenerateBibliographyDto, AddBibliographyEntryDto,
  PublishThesisDto, AddCommentDto,
} from './dto/skripsweet.dto';

@Controller('skripsweet')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('skripsweet')
export class SkripsweetController {
  constructor(private readonly svc: SkripsweetService) {}

  // ─── Thesis CRUD ────────────────────────────────────────────

  @Post()
  create(@GetUser() user: User, @Body() dto: CreateThesisDto) {
    return this.svc.createThesis(user.id, dto);
  }

  @Get()
  getMyTheses(@GetUser() user: User) {
    return this.svc.getMyTheses(user.id);
  }

  // ─── Community (before :id to avoid route conflict) ────────

  @Get('community/explore')
  explore(
    @GetUser() user: User,
    @Query('q') query?: string,
    @Query('tag') tag?: string,
    @Query('university') university?: string,
    @Query('page') page?: string,
  ) {
    return this.svc.explore(user.id, query, tag, university, page ? parseInt(page) : 1);
  }

  @Get('community/trending-tags')
  trendingTags() {
    return this.svc.getTrendingTags();
  }

  @Get('community/bookmarks')
  myBookmarks(@GetUser() user: User) {
    return this.svc.getMyBookmarks(user.id);
  }

  @Get('community/:id')
  publicThesis(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getPublicThesis(user.id, id);
  }

  // ─── Thesis CRUD ────────────────────────────────────────────

  @Get(':id')
  getDetail(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getThesisDetail(user.id, id);
  }

  @Get(':id/export')
  exportThesis(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.exportThesis(user.id, id);
  }

  @Patch(':id')
  update(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateThesisDto) {
    return this.svc.updateThesis(user.id, id, dto);
  }

  @Delete(':id')
  delete(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteThesis(user.id, id);
  }

  // ─── Format Template ───────────────────────────────────────

  @Patch(':id/format')
  setFormat(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetFormatTemplateDto) {
    return this.svc.setFormatTemplate(user.id, id, dto);
  }

  @Post(':id/format/explain')
  explainFormat(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExplainFormatDto) {
    return this.svc.explainFormat(user.id, id, dto);
  }

  // ─── Chapters ──────────────────────────────────────────────

  @Post(':id/chapters')
  createChapter(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateChapterDto) {
    return this.svc.createChapter(user.id, id, dto);
  }

  @Patch(':id/chapters/:chapterId')
  updateChapter(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.svc.updateChapter(user.id, id, chapterId, dto);
  }

  @Delete(':id/chapters/:chapterId')
  deleteChapter(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
  ) {
    return this.svc.deleteChapter(user.id, id, chapterId);
  }

  @Post(':id/chapters/:chapterId/feedback')
  getChapterFeedback(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
  ) {
    return this.svc.getAiChapterFeedback(user.id, id, chapterId);
  }

  @Post(':id/chapters/:chapterId/ai-assist')
  aiWriteAssist(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() dto: AiWriteAssistDto,
  ) {
    return this.svc.aiWriteAssist(user.id, id, chapterId, dto);
  }

  // ─── Journals ──────────────────────────────────────────────

  @Post(':id/journals')
  addJournal(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddJournalDto) {
    return this.svc.addJournal(user.id, id, dto);
  }

  @Delete(':id/journals/:journalId')
  removeJournal(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('journalId', ParseUUIDPipe) journalId: string,
  ) {
    return this.svc.removeJournal(user.id, id, journalId);
  }

  @Post(':id/journals/search')
  searchJournals(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SearchJournalDto) {
    return this.svc.searchJournals(user.id, id, dto);
  }

  @Get(':id/journals/matrix')
  getRelevanceMatrix(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getRelevanceMatrix(user.id, id);
  }

  // ─── Bimbingan ─────────────────────────────────────────────

  @Post(':id/bimbingan')
  createBimbingan(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBimbinganDto) {
    return this.svc.createBimbingan(user.id, id, dto);
  }

  @Patch(':id/bimbingan/:bimbinganId')
  updateBimbingan(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bimbinganId', ParseUUIDPipe) bimbinganId: string,
    @Body() dto: UpdateBimbinganDto,
  ) {
    return this.svc.updateBimbingan(user.id, id, bimbinganId, dto);
  }

  @Delete(':id/bimbingan/:bimbinganId')
  deleteBimbingan(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bimbinganId', ParseUUIDPipe) bimbinganId: string,
  ) {
    return this.svc.deleteBimbingan(user.id, id, bimbinganId);
  }

  // ─── Chat AI ───────────────────────────────────────────────

  @Post(':id/chat')
  chat(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ThesisChatDto) {
    return this.svc.chat(user.id, id, dto);
  }

  @Get(':id/chat/history')
  getChatHistory(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getChatHistory(user.id, id, page ? parseInt(page) : 1, limit ? Math.min(parseInt(limit), 50) : 20);
  }

  @Delete(':id/chat/history')
  clearChatHistory(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.clearChatHistory(user.id, id);
  }

  // ─── Bibliography ──────────────────────────────────────────

  @Post(':id/bibliography/generate')
  generateBibliography(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateBibliographyDto) {
    return this.svc.generateBibliography(user.id, id, dto.style);
  }

  @Post(':id/bibliography')
  addBibliographyEntry(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBibliographyEntryDto) {
    return this.svc.addBibliographyEntry(user.id, id, dto);
  }

  @Delete(':id/bibliography/:entryId')
  deleteBibliographyEntry(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.svc.deleteBibliographyEntry(user.id, id, entryId);
  }

  // ─── Progress ──────────────────────────────────────────────

  @Get(':id/progress')
  getProgress(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getProgress(user.id, id);
  }

  // ─── Social / Community ────────────────────────────────────

  @Post(':id/publish')
  publish(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishThesisDto) {
    return this.svc.publishThesis(user.id, id, dto.tags || []);
  }

  @Post(':id/unpublish')
  unpublish(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.unpublishThesis(user.id, id);
  }

  @Post(':id/like')
  toggleLike(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.toggleLike(user.id, id);
  }

  @Post(':id/bookmark')
  toggleBookmark(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.toggleBookmark(user.id, id);
  }

  @Post(':id/comments')
  addComment(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCommentDto) {
    return this.svc.addComment(user.id, id, dto.content);
  }

  @Delete('comments/:commentId')
  deleteComment(@GetUser() user: User, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.svc.deleteComment(user.id, commentId);
  }
}
