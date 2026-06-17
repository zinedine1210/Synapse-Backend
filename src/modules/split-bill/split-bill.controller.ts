import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { SplitBillService } from './split-bill.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('split-bill')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('split_bill')
export class SplitBillController {
  constructor(private readonly svc: SplitBillService) {}

  @Post('scan-receipt')
  scanReceipt(@GetUser() user: User, @Body() body: { imageBase64: string; mimeType: string }) {
    return this.svc.scanReceipt(user.id, body.imageBase64, body.mimeType);
  }

  @Post()
  createBill(@GetUser() user: User, @Body() body: {
    eventName?: string;
    items: { name: string; price: number; quantity?: number }[];
    participants: string[];
  }) {
    return this.svc.createBill(user.id, body);
  }

  @Get()
  getMyBills(@GetUser() user: User, @Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Math.max(1, parseInt(page || '1', 10) || 1);
    const l = Math.min(50, Math.max(1, parseInt(limit || '20', 10) || 20));
    return this.svc.getMyBills(user.id, p, l);
  }

  @Post('detect-splittable')
  detectSplittable(@GetUser() user: User) {
    return this.svc.detectSplittable(user.id);
  }

  @Get('history-summary')
  getHistorySummary(@GetUser() user: User) {
    return this.svc.getHistorySummary(user.id);
  }

  @Get(':id')
  getBill(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getBillById(user.id, id);
  }

  @Patch('items/:itemId/assign')
  assignItem(
    @GetUser() user: User,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { participantIds: string[] },
  ) {
    return this.svc.assignItemToParticipant(user.id, itemId, body.participantIds);
  }

  @Patch(':id/participants/:pid/paid')
  markPaid(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
  ) {
    return this.svc.markParticipantPaid(user.id, id, pid);
  }

  @Get(':id/wa-message/:participantId')
  getWhatsAppMessage(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.svc.generateWhatsAppMessage(user.id, id, participantId);
  }

  @Delete(':id')
  deleteBill(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteBill(user.id, id);
  }
}
