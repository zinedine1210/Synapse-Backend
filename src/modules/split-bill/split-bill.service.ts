import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { SplitBillGateway } from './split-bill.gateway';

@Injectable()
export class SplitBillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly splitBillGateway: SplitBillGateway,
  ) {}

  async scanReceipt(imageBase64: string, mimeType: string) {
    const prompt = `Kamu adalah OCR parser untuk struk belanja Indonesia.

Dari foto struk ini, ekstrak informasi berikut dalam format JSON:
{
  "storeName": "Nama Toko",
  "date": "2024-01-15",
  "items": [
    { "name": "Nasi Goreng", "price": 25000, "quantity": 1 }
  ],
  "subtotal": 75000,
  "tax": 7500,
  "total": 82500,
  "paymentMethod": "Cash"
}

Catatan:
- Harga dalam Rupiah (tanpa "Rp" prefix)
- Quantity default 1 jika tidak tertera
- Jika ada diskon, tampilkan harga setelah diskon
- Jika struk tidak terbaca, return { "error": "Struk tidak terbaca" }`;

    const result = await this.ai.generateText(prompt, {
      imageBase64,
      mimeType,
    });

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { error: 'Gagal memproses struk', rawResponse: result };
    }
  }

  async createBill(userId: string, data: {
    eventName?: string;
    items: { name: string; price: number; quantity?: number }[];
    participants: string[];
  }) {
    const totalAmount = data.items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);

    return this.prisma.splitBill.create({
      data: {
        userId,
        eventName: data.eventName,
        totalAmount,
        items: {
          create: data.items.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity ?? 1,
          })),
        },
        participants: {
          create: data.participants.map(name => ({ name })),
        },
      },
      include: { items: true, participants: true },
    });
  }

  async getMyBills(userId: string) {
    return this.prisma.splitBill.findMany({
      where: { userId },
      include: {
        items: true,
        participants: true,
        _count: { select: { items: true, participants: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBillById(userId: string, billId: string) {
    const bill = await this.prisma.splitBill.findUnique({
      where: { id: billId },
      include: { items: true, participants: true },
    });

    if (!bill) throw new NotFoundException('Bill tidak ditemukan.');
    if (bill.userId !== userId) throw new ForbiddenException('Akses ditolak.');

    return bill;
  }

  async assignItemToParticipant(userId: string, itemId: string, participantIds: string[]) {
    const item = await this.prisma.splitBillItem.findUnique({
      where: { id: itemId },
      include: { bill: true },
    });

    if (!item) throw new NotFoundException('Item tidak ditemukan.');
    if (item.bill.userId !== userId) throw new ForbiddenException('Akses ditolak.');

    await this.prisma.splitBillItem.update({
      where: { id: itemId },
      data: { assignedTo: participantIds },
    });

    // Recalculate all participant totals
    await this.recalculateTotals(item.billId);

    return this.getBillById(userId, item.billId);
  }

  private async recalculateTotals(billId: string) {
    const bill = await this.prisma.splitBill.findUnique({
      where: { id: billId },
      include: { items: true, participants: true },
    });

    if (!bill) return;

    const participantTotals: Record<string, number> = {};
    bill.participants.forEach(p => { participantTotals[p.id] = 0; });

    for (const item of bill.items) {
      if (item.assignedTo.length === 0) continue;
      const perPerson = (item.price * item.quantity) / item.assignedTo.length;
      for (const pid of item.assignedTo) {
        if (participantTotals[pid] !== undefined) {
          participantTotals[pid] += perPerson;
        }
      }
    }

    // Apply proportional tax if total differs from sum of items
    const itemsTotal = bill.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const taxRatio = itemsTotal > 0 ? bill.totalAmount / itemsTotal : 1;

    for (const participant of bill.participants) {
      const rawOwed = participantTotals[participant.id] ?? 0;
      await this.prisma.splitParticipant.update({
        where: { id: participant.id },
        data: { totalOwed: Math.round(rawOwed * taxRatio) },
      });
    }
  }

  async markParticipantPaid(userId: string, billId: string, participantId: string) {
    const participant = await this.prisma.splitParticipant.findUnique({
      where: { id: participantId },
      include: { bill: true },
    });

    if (!participant) throw new NotFoundException('Peserta tidak ditemukan.');
    if (participant.bill.userId !== userId) throw new ForbiddenException('Akses ditolak.');
    if (participant.billId !== billId) throw new NotFoundException('Peserta tidak ditemukan di bill ini.');

    await this.prisma.splitParticipant.update({
      where: { id: participantId },
      data: { isPaid: true },
    });

    // Check if all paid → mark bill done
    const allParticipants = await this.prisma.splitParticipant.findMany({
      where: { billId: participant.billId },
    });
    const allPaid = allParticipants.every(p => p.id === participantId || p.isPaid);
    if (allPaid) {
      await this.prisma.splitBill.update({
        where: { id: participant.billId },
        data: { status: 'done' },
      });
    }

    const updatedBill = await this.getBillById(userId, participant.billId);

    // Broadcast via Socket.IO
    this.splitBillGateway.emitPaymentUpdated(participant.billId, {
      participantId,
      isPaid: true,
      bill: updatedBill,
    });

    return updatedBill;
  }

  async generateWhatsAppMessage(userId: string, billId: string, participantId: string) {
    const bill = await this.getBillById(userId, billId);
    const participant = bill.participants.find((p: any) => p.id === participantId);
    if (!participant) throw new NotFoundException('Peserta tidak ditemukan.');

    const items = bill.items
      .filter((item: any) => item.assignedTo.includes(participantId))
      .map((item: any) => `- ${item.name}: Rp ${(item.price * item.quantity / item.assignedTo.length).toLocaleString('id-ID')}`);

    const message = [
      `Hai ${participant.name}! 👋`,
      bill.eventName ? `\nIni tagihan dari: *${bill.eventName}*` : '',
      '\nRincian bagianmu:',
      ...items,
      `\n*Total: Rp ${participant.totalOwed.toLocaleString('id-ID')}*`,
      '\nTerima kasih! 🙏',
    ].filter(Boolean).join('\n');

    return { message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}` };
  }

  async deleteBill(userId: string, billId: string) {
    const bill = await this.prisma.splitBill.findUnique({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill tidak ditemukan.');
    if (bill.userId !== userId) throw new ForbiddenException('Akses ditolak.');

    await this.prisma.splitBill.delete({ where: { id: billId } });
    return { message: 'Bill dihapus.' };
  }

  /**
   * Detect potential split-worthy transactions from recent expenses.
   * Criteria: amount > 100k AND category in (makanan, hiburan, minuman).
   * These are likely group expenses (restaurant, entertainment).
   */
  async detectSplittable(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const splittableCategories = ['makanan', 'minuman', 'hiburan'];
    const amountThreshold = 100000;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'expense',
        amount: { gte: amountThreshold },
        category: { in: splittableCategories },
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });

    return transactions.map(tx => ({
      id: tx.id,
      label: tx.label,
      amount: tx.amount,
      category: tx.category,
      date: tx.date,
      suggestedReason: tx.amount >= 200000
        ? 'Nominal besar, kemungkinan makan bersama'
        : 'Kategori yang sering dibagi',
    }));
  }

  /**
   * Get cumulative debt/credit summary across all bills for the user.
   * Aggregates all SplitParticipant records across all user's bills
   * and computes net debt/credit per friend (participant name).
   */
  async getHistorySummary(userId: string) {
    const bills = await this.prisma.splitBill.findMany({
      where: { userId },
      include: { participants: true },
    });

    // Aggregate totals per participant name
    const summary: Record<string, { totalOwed: number; totalPaid: number }> = {};

    for (const bill of bills) {
      for (const participant of bill.participants) {
        if (!summary[participant.name]) {
          summary[participant.name] = { totalOwed: 0, totalPaid: 0 };
        }
        summary[participant.name].totalOwed += participant.totalOwed;
        if (participant.isPaid) {
          summary[participant.name].totalPaid += participant.totalOwed;
        }
      }
    }

    return Object.entries(summary).map(([name, data]) => ({
      name,
      totalOwed: data.totalOwed,
      totalPaid: data.totalPaid,
      outstanding: data.totalOwed - data.totalPaid,
    }));
  }
}
