import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, ParseIntPipe,
} from '@nestjs/common';
import { DuitTrackerService } from './duit-tracker.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { SetBudgetDto } from './dto/set-budget.dto';
import { CreateTreeDto, TreeTransactionDto } from './dto/create-tree.dto';
import { UpdateTreeDto } from './dto/update-tree.dto';

@Controller('duit-tracker')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('duit_tracker')
export class DuitTrackerController {
  constructor(private readonly svc: DuitTrackerService) {}

  // ── Transactions ──

  @Post('transactions')
  createTransaction(@GetUser() user: User, @Body() dto: CreateTransactionDto) {
    return this.svc.createTransaction(user.id, dto);
  }

  @Get('transactions')
  getTransactions(
    @GetUser() user: User,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getTransactions(user.id, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      category,
      type,
      startDate,
      endDate,
    });
  }

  @Delete('transactions/:id')
  deleteTransaction(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteTransaction(user.id, id);
  }

  @Patch('transactions/:id')
  updateTransaction(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto) {
    return this.svc.updateTransaction(user.id, id, dto);
  }

  @Post('transactions/:id/comment')
  generateComment(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.generateBawelCommentManual(user.id, id);
  }

  @Get('summary')
  getSummary(
    @GetUser() user: User,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.svc.getSummary(user.id, month, year);
  }

  // ── Budget ──

  @Post('budgets')
  setBudget(@GetUser() user: User, @Body() dto: SetBudgetDto) {
    return this.svc.setBudget(user.id, dto);
  }

  @Get('budgets')
  getBudgets(
    @GetUser() user: User,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.svc.getBudgets(user.id, month, year);
  }

  @Delete('budgets/:id')
  deleteBudget(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteBudget(user.id, id);
  }

  // ── Saving Trees ──

  @Post('trees')
  createTree(@GetUser() user: User, @Body() dto: CreateTreeDto) {
    return this.svc.createTree(user.id, dto);
  }

  @Get('trees')
  getTrees(@GetUser() user: User) {
    return this.svc.getTrees(user.id);
  }

  @Post('trees/:treeId/transactions')
  addTreeTransaction(
    @GetUser() user: User,
    @Param('treeId', ParseUUIDPipe) treeId: string,
    @Body() dto: TreeTransactionDto,
  ) {
    return this.svc.addTreeTransaction(user.id, treeId, dto);
  }

  @Delete('trees/:treeId')
  deleteTree(@GetUser() user: User, @Param('treeId', ParseUUIDPipe) treeId: string) {
    return this.svc.deleteTree(user.id, treeId);
  }

  @Patch('trees/:treeId')
  updateTree(@GetUser() user: User, @Param('treeId', ParseUUIDPipe) treeId: string, @Body() dto: UpdateTreeDto) {
    return this.svc.updateTree(user.id, treeId, dto);
  }

  // ── AI Parse ──

  @Post('parse')
  parseNaturalInput(@GetUser() user: User, @Body('text') text: string) {
    return this.svc.parseNaturalInput(user.id, text);
  }

  @Post('scan-receipt')
  scanReceipt(@GetUser() user: User, @Body() body: { base64: string; mimeType: string }) {
    return this.svc.scanReceipt(user.id, body.base64, body.mimeType);
  }

  // ── Subscription Dismissal ──

  @Post('dismiss-subscription')
  dismissSubscription(@GetUser() user: User, @Body('pattern') pattern: string) {
    return this.svc.dismissSubscription(user.id, pattern);
  }

  // ── Debt/Hutang ──

  @Get('debts')
  getDebts(@GetUser() user: User, @Query('isPaid') isPaid?: string) {
    return this.svc.getDebts(user.id, isPaid !== undefined ? isPaid === 'true' : undefined);
  }

  @Post('debts')
  createDebt(@GetUser() user: User, @Body() dto: { description: string; amount: number; debtType: string; personName: string; dueDate?: string }) {
    return this.svc.createDebt(user.id, dto);
  }

  @Patch('debts/:id')
  updateDebt(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { description?: string; amount?: number; debtType?: string; personName?: string; dueDate?: string }) {
    return this.svc.updateDebt(user.id, id, dto);
  }

  @Delete('debts/:id')
  deleteDebt(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteDebt(user.id, id);
  }

  @Post('debts/:id/pay')
  markDebtPaid(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markDebtPaid(user.id, id);
  }

  // ── Recurring Bills / Tagihan ──

  @Get('bills')
  getBills(@GetUser() user: User) {
    return this.svc.getBills(user.id);
  }

  @Post('bills')
  createBill(@GetUser() user: User, @Body() dto: { name: string; amount: number; dueDay: number; category?: string; notes?: string }) {
    return this.svc.createBill(user.id, dto);
  }

  @Patch('bills/:id')
  updateBill(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { name?: string; amount?: number; dueDay?: number; isActive?: boolean; notes?: string }) {
    return this.svc.updateBill(user.id, id, dto);
  }

  @Delete('bills/:id')
  deleteBill(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteBill(user.id, id);
  }

  @Post('bills/:id/pay')
  markBillPaid(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markBillPaid(user.id, id);
  }

  @Get('financial-overview')
  getFinancialOverview(@GetUser() user: User) {
    return this.svc.getFinancialOverview(user.id);
  }

  // ── Wishlist / Rencana Belanja ──

  @Get('wishlist')
  getWishlist(@GetUser() user: User) {
    return this.svc.getWishlist(user.id);
  }

  @Post('wishlist')
  createWishlistItem(@GetUser() user: User, @Body() dto: { name: string; estimatedPrice: number; priority?: string; category?: string; targetDate?: string; notes?: string; url?: string }) {
    return this.svc.createWishlistItem(user.id, dto);
  }

  @Patch('wishlist/:id')
  updateWishlistItem(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { name?: string; estimatedPrice?: number; priority?: string; category?: string; targetDate?: string; notes?: string; url?: string }) {
    return this.svc.updateWishlistItem(user.id, id, dto);
  }

  @Delete('wishlist/:id')
  deleteWishlistItem(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteWishlistItem(user.id, id);
  }

  @Post('wishlist/:id/purchase')
  markWishlistPurchased(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto?: { linkedTransactionId?: string }) {
    return this.svc.markWishlistPurchased(user.id, id, dto?.linkedTransactionId);
  }

  // ── Budget Challenge & Streak ──

  @Get('challenges')
  getChallenges(@GetUser() user: User) {
    return this.svc.getChallenges(user.id);
  }

  @Post('challenges')
  createChallenge(@GetUser() user: User, @Body() dto: { title: string; description?: string; type: string; targetAmount?: number; targetDays?: number; category?: string }) {
    return this.svc.createChallenge(user.id, dto);
  }

  @Post('challenges/:id/progress')
  updateChallengeProgress(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.updateChallengeProgress(user.id, id);
  }

  @Delete('challenges/:id')
  deleteChallenge(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteChallenge(user.id, id);
  }

  // ── Custom Categories ──

  @Get('categories')
  getCustomCategories(@GetUser() user: User) {
    return this.svc.getCustomCategories(user.id);
  }

  @Post('categories')
  createCustomCategory(@GetUser() user: User, @Body() dto: { name: string; emoji?: string; type?: string; color?: string }) {
    return this.svc.createCustomCategory(user.id, dto);
  }

  @Patch('categories/:id')
  updateCustomCategory(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { name?: string; emoji?: string; color?: string; sortOrder?: number }) {
    return this.svc.updateCustomCategory(user.id, id, dto);
  }

  @Delete('categories/:id')
  deleteCustomCategory(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteCustomCategory(user.id, id);
  }

  // ── Spending Comparison ──

  @Get('comparison')
  getSpendingComparison(@GetUser() user: User) {
    return this.svc.getSpendingComparison(user.id);
  }

  // ── Financial Forecast ──

  @Get('forecast')
  getFinancialForecast(@GetUser() user: User) {
    return this.svc.getFinancialForecast(user.id);
  }

  // ── CSV Bulk Import ──

  @Post('bulk-import')
  bulkImport(@GetUser() user: User, @Body() dto: { transactions: { amount: number; type: string; category: string; label: string; note?: string; date?: string }[] }) {
    return this.svc.bulkCreateTransactions(user.id, dto.transactions);
  }

  // ── Smart Reminders ──

  @Get('reminders')
  getReminders(@GetUser() user: User) {
    return this.svc.getReminders(user.id);
  }
}
