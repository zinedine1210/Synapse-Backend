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
  ) {
    return this.svc.getTransactions(user.id, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      category,
      type,
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
    return this.svc.scanReceipt(body.base64, body.mimeType);
  }
}
