import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdatePlanConfigDto } from './dto/update-plan-config.dto';

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemAnalytics() {
    const [
      totalUsers,
      proUsers,
      totalClasses,
      totalMaterials,
      processingMaterials,
      totalPayments,
      successPayments,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { plan: 'PRO' } }),
      this.prisma.class.count(),
      this.prisma.material.count(),
      this.prisma.material.count({ where: { status: 'PROCESSING' } }),
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { transactionStatus: 'settlement' } }),
      this.prisma.payment.aggregate({
        where: { transactionStatus: 'settlement' },
        _sum: { grossAmount: true },
      }),
    ]);

    return {
      users: { total: totalUsers, pro: proUsers, free: totalUsers - proUsers },
      classes: { total: totalClasses },
      materials: { total: totalMaterials, processing: processingMaterials },
      payments: {
        total: totalPayments,
        success: successPayments,
        totalRevenue: totalRevenue._sum.grossAmount ?? 0,
      },
    };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        plan: true,
        uploadCount: true,
        createdAt: true,
        _count: { select: { classes: true, payments: true } },
      },
    });
  }

  async getPlanConfigs() {
    return this.prisma.pricingPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async updatePlanConfig(plan: string, dto: UpdatePlanConfigDto) {
    return this.prisma.pricingPlan.update({
      where: { name: plan },
      data: dto,
    });
  }

  async createPricingPlan(dto: any) {
    return this.prisma.pricingPlan.create({
      data: dto,
    });
  }

  async updatePricingPlan(id: string, dto: any) {
    return this.prisma.pricingPlan.update({
      where: { id },
      data: dto,
    });
  }

  async deletePricingPlan(id: string) {
    return this.prisma.pricingPlan.delete({
      where: { id },
    });
  }

  async assignUserPlan(userId: string, planName: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: planName },
    });
  }

  async getAllClasses() {
    return this.prisma.class.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        code: true,
        createdAt: true,
        _count: { select: { members: true, sessions: true, forumPosts: true, tasks: true } },
        members: {
          where: { role: 'OWNER' },
          select: { user: { select: { fullName: true, email: true } } },
          take: 1,
        },
      },
    });
  }

  async deleteClass(id: string) {
    await this.prisma.class.delete({ where: { id } });
    return { message: 'Kelas berhasil dihapus.' };
  }

  async getForumStats() {
    const [totalPosts, totalReplies, postsToday, activeClasses] = await Promise.all([
      this.prisma.forumPost.count(),
      this.prisma.forumReply.count(),
      this.prisma.forumPost.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.forumPost.groupBy({
        by: ['classId'],
        _count: true,
        orderBy: { _count: { classId: 'desc' } },
        take: 10,
      }),
    ]);
    return { totalPosts, totalReplies, postsToday, activeClasses: activeClasses.length };
  }
}
