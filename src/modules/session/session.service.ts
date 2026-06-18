import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  /** Remove material files from Supabase Storage */
  private async cleanupMaterialFiles(materials: { fileUrl: string }[]) {
    const paths: string[] = [];
    for (const mat of materials) {
      if (!mat.fileUrl) continue;
      try {
        const url = new URL(mat.fileUrl);
        const pathParts = url.pathname.split('/storage/v1/object/public/materials/');
        if (pathParts[1]) paths.push(decodeURIComponent(pathParts[1]));
      } catch { /* skip invalid URLs */ }
    }
    if (paths.length > 0) {
      const { error } = await this.supabase.storage.from('materials').remove(paths);
      if (error) this.logger.warn(`Failed to remove ${paths.length} files from storage: ${error.message}`);
      else this.logger.log(`Removed ${paths.length} files from storage`);
    }
  }

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }
  async findSessionById(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        materials: { orderBy: { createdAt: 'asc' } },
        quizzes: { orderBy: { createdAt: 'asc' } },
        class: { include: { members: { where: { userId } } } },
      },
    });

    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');

    if (session.class.members.length === 0) {
      throw new ForbiddenException('Anda tidak memiliki akses ke sesi ini.');
    }

    return session;
  }

  /** POST /sessions/class/:classId - Buat sesi baru */
  async createSession(classId: string, userId: string, dto: { title?: string }) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });

    if (!member) {
      throw new ForbiddenException('Anda bukan anggota kelas ini.');
    }
    if (!this.hasPermission(member, 'MANAGE_SESSIONS')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk membuat pertemuan.');
    }

    const count = await this.prisma.session.count({
      where: { classId },
    });

    const sequence = count + 1;
    const title = dto.title || `Pertemuan ${sequence}`;

    return this.prisma.session.create({
      data: {
        classId,
        title,
        sequence,
      },
    }).then(session => {
      // Notify class members about new session
      this.notificationService.notifyClassMembers(
        classId,
        userId,
        '📖 Pertemuan Baru',
        `Pertemuan baru: "${title}" telah dibuat.`,
        { category: 'kelas', actionUrl: `/class/${classId}` },
      ).catch(() => {});
      return session;
    });
  }

  /** PATCH /sessions/:id - Update sesi (title) */
  async updateSession(sessionId: string, userId: string, dto: { title: string }) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        class: { include: { members: { where: { userId }, include: { classRole: true } } } },
      },
    });

    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');

    const member = session.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'MANAGE_SESSIONS')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk mengubah pertemuan.');
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: { title: dto.title },
    });
  }

  /** DELETE /sessions/:id - Hapus sesi */
  async deleteSession(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        class: { include: { members: { where: { userId }, include: { classRole: true } } } },
      },
    });

    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');

    const member = session.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'MANAGE_SESSIONS')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus pertemuan.');
    }

    // Fetch materials to clean up files from Supabase Storage before deleting
    const materials = await this.prisma.material.findMany({
      where: { sessionId },
      select: { fileUrl: true },
    });
    await this.cleanupMaterialFiles(materials);

    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    // Sesuaikan sequence untuk sesi setelahnya
    await this.prisma.session.updateMany({
      where: {
        classId: session.classId,
        sequence: { gt: session.sequence },
      },
      data: {
        sequence: { decrement: 1 },
      },
    });

    return { success: true };
  }

  /** PATCH /sessions/:id/reorder - Ubah urutan/sequence sesi */
  async reorderSession(sessionId: string, userId: string, dto: { newSequence: number }) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        class: { include: { members: { where: { userId }, include: { classRole: true } } } },
      },
    });

    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');

    const member = session.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'MANAGE_SESSIONS')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk mengurutkan pertemuan.');
    }

    const oldSeq = session.sequence;
    const newSeq = dto.newSequence;
    if (oldSeq === newSeq) return session;

    const totalCount = await this.prisma.session.count({
      where: { classId: session.classId },
    });
    const targetSeq = Math.max(1, Math.min(newSeq, totalCount));

    if (oldSeq < targetSeq) {
      // Pindah ke bawah: geser yang di antaranya ke atas (decrement)
      await this.prisma.session.updateMany({
        where: {
          classId: session.classId,
          sequence: { gt: oldSeq, lte: targetSeq },
        },
        data: { sequence: { decrement: 1 } },
      });
    } else {
      // Pindah ke atas: geser yang di antaranya ke bawah (increment)
      await this.prisma.session.updateMany({
        where: {
          classId: session.classId,
          sequence: { gte: targetSeq, lt: oldSeq },
        },
        data: { sequence: { increment: 1 } },
      });
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: { sequence: targetSeq },
    });
  }
}
