import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class KolektifService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMember(classId: string, userId: string) {
    const m = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId } }, include: { classRole: true } });
    if (!m) throw new ForbiddenException('Bukan anggota kelas.');
    return m;
  }

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }

  async getAll(classId: string, userId: string) {
    await this.ensureMember(classId, userId);
    const funds = await this.prisma.kolektif.findMany({
      where: { classId },
      include: {
        transactions: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return funds.map((f) => {
      const totalIn = f.transactions.filter((t) => t.type === 'IN').reduce((s, t) => s + t.amount, 0);
      const totalOut = f.transactions.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.amount, 0);
      return { ...f, balance: totalIn - totalOut, totalIn, totalOut };
    });
  }

  async create(classId: string, userId: string, data: { name: string; description?: string; targetAmount?: number; targetPerPerson?: number }) {
    const member = await this.ensureMember(classId, userId);
    if (!this.hasPermission(member, 'KAS_CREATE')) throw new ForbiddenException('Anda tidak memiliki izin untuk membuat kas.');
    return this.prisma.kolektif.create({ data: { classId, ...data } });
  }

  async setTargetPerPerson(kolektifId: string, userId: string, data: { targetPerPerson: number }) {
    const fund = await this.prisma.kolektif.findUnique({ where: { id: kolektifId } });
    if (!fund) throw new NotFoundException('Kas tidak ditemukan.');
    const member = await this.ensureMember(fund.classId, userId);
    if (!this.hasPermission(member, 'KAS_TRANSACTION')) throw new ForbiddenException('Anda tidak memiliki izin untuk mengatur kas.');

    return this.prisma.kolektif.update({
      where: { id: kolektifId },
      data: { targetPerPerson: data.targetPerPerson },
    });
  }

  async addTransaction(kolektifId: string, userId: string, data: { amount: number; type: 'IN' | 'OUT'; description?: string; targetUserId?: string }) {
    const fund = await this.prisma.kolektif.findUnique({ where: { id: kolektifId } });
    if (!fund) throw new NotFoundException('Kas tidak ditemukan.');
    const member = await this.ensureMember(fund.classId, userId);
    if (!this.hasPermission(member, 'KAS_TRANSACTION')) throw new ForbiddenException('Anda tidak memiliki izin untuk mencatat transaksi.');

    let finalUserId = userId;
    if (data.targetUserId) {
      finalUserId = data.targetUserId;
    }

    return this.prisma.kolektifTransaction.create({
      data: {
        kolektifId,
        userId: finalUserId,
        amount: data.amount,
        type: data.type,
        description: data.description,
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
  }

  async getSummaryByUser(kolektifId: string, userId: string) {
    const fund = await this.prisma.kolektif.findUnique({ where: { id: kolektifId } });
    if (!fund) throw new NotFoundException('Kas tidak ditemukan.');
    await this.ensureMember(fund.classId, userId);

    const members = await this.prisma.classMember.findMany({
      where: { classId: fund.classId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true, email: true } } },
    });

    const transactions = await this.prisma.kolektifTransaction.findMany({
      where: { kolektifId },
    });

    const target = fund.targetPerPerson || 0;

    const summary = members.map((member) => {
      const userTx = transactions.filter((t) => t.userId === member.userId);
      const totalIn = userTx.filter((t) => t.type === 'IN').reduce((s, t) => s + t.amount, 0);
      const totalOut = userTx.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.amount, 0);
      
      let status = 'PARTISIPASI';
      let diff = 0;
      if (target > 0) {
        if (totalIn >= target) {
          status = 'LUNAS';
        } else if (totalIn > 0) {
          status = 'KURANG';
          diff = target - totalIn;
        } else {
          status = 'BELUM_SETOR';
          diff = target;
        }
      }

      return {
        user: member.user,
        role: member.role,
        totalIn,
        totalOut,
        balance: totalIn - totalOut,
        status,
        diff,
      };
    });

    return {
      kolektif: fund,
      summary,
      targetPerPerson: target,
    };
  }

  async deleteTransaction(txId: string, userId: string) {
    const tx = await this.prisma.kolektifTransaction.findUnique({
      where: { id: txId },
      include: { kolektif: true },
    });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan.');
    const member = await this.ensureMember(tx.kolektif.classId, userId);
    if (tx.userId !== userId && !this.hasPermission(member, 'KAS_TRANSACTION')) throw new ForbiddenException('Tidak diizinkan.');
    await this.prisma.kolektifTransaction.delete({ where: { id: txId } });
    return { message: 'Transaksi dihapus.' };
  }

  async deleteFund(kolektifId: string, userId: string) {
    const fund = await this.prisma.kolektif.findUnique({ where: { id: kolektifId } });
    if (!fund) throw new NotFoundException('Kas tidak ditemukan.');
    const member = await this.ensureMember(fund.classId, userId);
    if (!this.hasPermission(member, 'KAS_CREATE')) throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus kas.');
    await this.prisma.kolektif.delete({ where: { id: kolektifId } });
    return { message: 'Kas dihapus.' };
  }
}
