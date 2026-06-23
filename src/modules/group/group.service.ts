import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureOwner(classId: string, userId: string) {
    const m = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId } }, include: { classRole: true } });
    if (!m) throw new ForbiddenException('Bukan anggota kelas.');
    if (!this.hasPermission(m, 'GROUP_MANAGE')) throw new ForbiddenException('Anda tidak memiliki izin untuk mengelola kelompok.');
    return m;
  }

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }

  private async ensureMember(classId: string, userId: string) {
    const m = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId } } });
    if (!m) throw new ForbiddenException('Bukan anggota kelas.');
    return m;
  }

  async getClassGroups(classId: string, userId: string) {
    await this.ensureMember(classId, userId);
    return this.prisma.taskGroup.findMany({
      where: { classId },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        tasks: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createGroup(classId: string, userId: string, name: string) {
    await this.ensureOwner(classId, userId);
    return this.prisma.taskGroup.create({
      data: { classId, name },
      include: { members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } },
    });
  }

  async deleteGroup(groupId: string, userId: string) {
    const g = await this.prisma.taskGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new NotFoundException('Kelompok tidak ditemukan.');
    await this.ensureOwner(g.classId, userId);
    await this.prisma.taskGroup.delete({ where: { id: groupId } });
    return { message: 'Kelompok dihapus.' };
  }

  async addMember(groupId: string, targetUserId: string, userId: string) {
    const g = await this.prisma.taskGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new NotFoundException('Kelompok tidak ditemukan.');
    await this.ensureOwner(g.classId, userId);
    // verify target is class member
    const isMember = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId: g.classId, userId: targetUserId } } });
    if (!isMember) throw new BadRequestException('User bukan anggota kelas.');
    return this.prisma.taskGroupMember.create({
      data: { groupId, userId: targetUserId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
  }

  async removeMember(groupId: string, targetUserId: string, userId: string) {
    const g = await this.prisma.taskGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new NotFoundException('Kelompok tidak ditemukan.');
    await this.ensureOwner(g.classId, userId);
    await this.prisma.taskGroupMember.deleteMany({ where: { groupId, userId: targetUserId } });
    return { message: 'Anggota dihapus dari kelompok.' };
  }

  /** Auto-generate groups from class members */
  async autoGenerate(classId: string, userId: string, groupCount: number) {
    await this.ensureOwner(classId, userId);
    const members = await this.prisma.classMember.findMany({
      where: { classId },
      select: { userId: true },
    });

    if (groupCount < 1 || groupCount > members.length) {
      throw new BadRequestException('Jumlah kelompok tidak valid.');
    }

    // Shuffle members
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const groups: string[][] = Array.from({ length: groupCount }, () => []);
    shuffled.forEach((m, i) => groups[i % groupCount].push(m.userId));

    const results = [];
    for (let i = 0; i < groupCount; i++) {
      const g = await this.prisma.taskGroup.create({
        data: {
          classId,
          name: `Kelompok ${i + 1}`,
          members: { create: groups[i].map((uid) => ({ userId: uid })) },
        },
        include: { members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } },
      });
      results.push(g);
    }
    return results;
  }

  /** Get user's group for a specific task */
  async getUserGroupForTask(taskId: string, _userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { taskGroup: { include: { members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } } } },
    });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan.');
    return task.taskGroup;
  }
}
