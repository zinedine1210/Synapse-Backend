import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClassService implements OnModuleInit {
  private readonly logger = new Logger(ClassService.name);
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

  private generateClassCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async onModuleInit() {
    // Populate code for any existing classes that don't have one
    const classes = await this.prisma.class.findMany({ where: { code: null } });
    for (const c of classes) {
      let code = this.generateClassCode();
      let exists = await this.prisma.class.findUnique({ where: { code } });
      while (exists) {
        code = this.generateClassCode();
        exists = await this.prisma.class.findUnique({ where: { code } });
      }
      await this.prisma.class.update({
        where: { id: c.id },
        data: { code },
      });
      this.logger.log(`Generated code ${code} for class ${c.name}`);
    }
  }

  /** Ambil semua kelas yang dimiliki atau diikuti user */
  async findUserClasses(userId: string) {
    const memberships = await this.prisma.classMember.findMany({
      where: { userId },
      include: {
        class: {
          include: {
            _count: { select: { sessions: true, members: true } },
          },
        },
      },
      orderBy: { class: { createdAt: 'desc' } },
    });

    return memberships.map((m) => ({ ...m.class, memberRole: m.role }));
  }

  /** Buat kelas baru (sessions dibuat manual oleh user) */
  async createClass(ownerId: string, dto: CreateClassDto) {
    let code = this.generateClassCode();
    let exists = await this.prisma.class.findUnique({ where: { code } });
    while (exists) {
      code = this.generateClassCode();
      exists = await this.prisma.class.findUnique({ where: { code } });
    }

    const newClass = await this.prisma.class.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId,
        lecturer: dto.lecturer,
        day: dto.day,
        time: dto.time,
        room: dto.room,
        password: dto.password ? await bcrypt.hash(dto.password, 10) : null,
        code,
        members: {
          create: { userId: ownerId, role: 'OWNER' },
        },
      },
      include: {
        sessions: { orderBy: { sequence: 'asc' } },
      },
    });

    this.logger.log(`Kelas baru dibuat: ${newClass.name} (Kode: ${code}) oleh user ${ownerId}`);

    // Create default "Admin" role with all permissions and assign to owner
    try {
      const defaultRole = await this.prisma.classRole.create({
        data: {
          classId: newClass.id,
          name: 'Admin',
          permissions: ClassService.ALL_PERMISSIONS,
          isDefault: true,
        },
      });
      await this.prisma.classMember.update({
        where: { classId_userId: { classId: newClass.id, userId: ownerId } },
        data: { classRoleId: defaultRole.id },
      });
    } catch (e) {
      this.logger.warn('Failed to create default role:', e);
    }

    return newClass;
  }

  /** Ambil detail satu kelas (pastikan user adalah member) */
  async findClassById(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { class: true, classRole: true },
    });

    if (!member) {
      throw new NotFoundException(
        'Kelas tidak ditemukan atau Anda bukan anggota kelas ini.',
      );
    }

    return {
      ...member.class,
      memberRole: member.role,
      memberStatus: (member as any).status || 'ACTIVE',
      classRoleId: member.classRoleId,
      classRole: member.classRole,
      permissions: member.role === 'OWNER'
        ? ClassService.ALL_PERMISSIONS
        : (member.classRole?.permissions || []),
    };
  }

  /** Ambil daftar sesi pertemuan sebuah kelas */
  async getClassSessions(classId: string, userId: string) {
    // Pastikan user adalah member kelas ini
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });

    if (!member) {
      throw new ForbiddenException('Anda bukan anggota kelas ini.');
    }

    return this.prisma.session.findMany({
      where: { classId },
      orderBy: { sequence: 'asc' },
      include: {
        _count: { select: { materials: true, quizzes: true } },
      },
    });
  }

  /** Update info kelas (hanya pemilik yang boleh) */
  async updateClass(classId: string, userId: string, dto: UpdateClassDto) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_CLASS');

    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.lecturer !== undefined && { lecturer: dto.lecturer }),
        ...(dto.day !== undefined && { day: dto.day }),
        ...(dto.time !== undefined && { time: dto.time }),
        ...(dto.room !== undefined && { room: dto.room }),
        ...(dto.password !== undefined && { password: dto.password ? await bcrypt.hash(dto.password, 10) : null }),
      },
    });

    this.logger.log(`Kelas ${classId} diperbarui oleh user ${userId}`);
    return updated;
  }

  /** Hapus kelas (hanya pemilik yang boleh) */
  async deleteClass(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });

    if (!member || member.role !== 'OWNER') {
      throw new ForbiddenException('Hanya pemilik kelas yang dapat menghapus kelas.');
    }

    await this.prisma.class.delete({ where: { id: classId } });
    this.logger.log(`Kelas ${classId} dihapus oleh user ${userId}`);

    return { message: 'Kelas berhasil dihapus.' };
  }

  /** Ambil info dasar kelas (untuk publik/join) */
  async findClassInfo(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { fullName: true } } },
        },
      },
    });

    if (!cls) {
      throw new NotFoundException('Kelas tidak ditemukan.');
    }

    return {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      ownerName: cls.members[0]?.user?.fullName || 'Pengajar',
      hasPassword: cls.password !== null && cls.password !== '',
      code: cls.code,
      joinMode: cls.joinMode,
    };
  }

  /** Resolve class code (first 8 chars of UUID or explicit code) to full class ID */
  async resolveClassCode(code: string) {
    if (!code || code.length < 4) throw new NotFoundException('Kode kelas tidak valid.');
    const normalizedCode = code.trim().toLowerCase();

    // Try exact match on code field first (case-insensitive)
    let cls = await this.prisma.class.findFirst({
      where: { code: { equals: code.trim().toUpperCase(), mode: 'insensitive' } },
      select: { id: true, name: true },
    });

    // If not found, try matching UUID prefix
    if (!cls) {
      cls = await this.prisma.class.findFirst({
        where: { id: { startsWith: normalizedCode } },
        select: { id: true, name: true },
      });
    }

    if (!cls) throw new NotFoundException('Kelas dengan kode tersebut tidak ditemukan.');
    return { classId: cls.id, name: cls.name };
  }

  /** Bergabung ke kelas sebagai MEMBER */
  async joinClass(classId: string, userId: string, password?: string) {
    const targetClass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { roles: { where: { isDefault: true } } },
    });

    if (!targetClass) {
      throw new NotFoundException('Kelas tidak ditemukan.');
    }

    // Cek apakah user sudah terdaftar di kelas
    const existingMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });

    if (existingMember) {
      return { message: 'Anda sudah bergabung di kelas ini.', role: existingMember.role, classId };
    }

    // Cek password jika ada (timing-safe comparison with bcrypt)
    if (targetClass.password) {
      const isMatch = password ? await bcrypt.compare(password, targetClass.password) : false;
      if (!isMatch) {
        throw new ForbiddenException('Password kelas salah.');
      }
    }

    const isPending = targetClass.joinMode === 'APPROVAL';
    const autoRole = targetClass.autoRoleAssign && targetClass.roles[0] ? targetClass.roles[0].id : null;

    const membership = await this.prisma.classMember.create({
      data: {
        classId,
        userId,
        role: 'MEMBER',
        status: isPending ? 'PENDING' : 'ACTIVE',
        classRoleId: !isPending && autoRole ? autoRole : null,
      },
    });

    this.logger.log(`User ${userId} ${isPending ? 'meminta bergabung' : 'bergabung'} ke kelas ${classId} sebagai MEMBER`);

    // Notify class owner/members about new member
    if (!isPending) {
      const joiner = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const joinerName = joiner?.fullName || 'Seseorang';
      this.notificationService.notifyClassMembers(
        classId,
        userId,
        '👥 Anggota Baru',
        `${joinerName} bergabung ke kelas "${targetClass.name}".`,
        { category: 'kelas', actionUrl: `/class/${classId}` },
      ).catch(() => {});
    } else {
      // Notify class owner about pending request
      const owner = await this.prisma.classMember.findFirst({ where: { classId, role: 'OWNER' }, select: { userId: true } });
      if (owner) {
        const joiner = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        this.notificationService.createNotification(
          owner.userId,
          '🔔 Permintaan Bergabung',
          `${joiner?.fullName || 'Seseorang'} ingin bergabung ke kelas "${targetClass.name}". Setujui?`,
          { category: 'kelas', actionUrl: `/class/${classId}` },
        ).catch(() => {});
      }
    }

    return { 
      message: isPending ? 'Permintaan bergabung telah dikirim. Menunggu persetujuan admin.' : 'Berhasil bergabung ke kelas.', 
      role: membership.role, 
      classId,
      status: membership.status,
    };
  }

  /** Approve pending member */
  async approveMember(classId: string, userId: string, targetUserId: string) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Anggota tidak ditemukan.');
    if (member.status !== 'PENDING') throw new ForbiddenException('Anggota sudah aktif.');

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { roles: { where: { isDefault: true } } },
    });
    const autoRole = cls?.autoRoleAssign && cls.roles[0] ? cls.roles[0].id : null;

    await this.prisma.classMember.update({
      where: { id: member.id },
      data: { status: 'ACTIVE', classRoleId: autoRole || member.classRoleId },
    });

    // Notify the approved user
    this.notificationService.createNotification(
      targetUserId,
      '✅ Permintaan Disetujui!',
      `Kamu sudah diterima di kelas "${cls?.name || ''}". Mulai eksplorasi sekarang!`,
      { category: 'kelas', actionUrl: `/class/${classId}` },
    ).catch(() => {});

    return { message: 'Anggota berhasil disetujui.' };
  }

  /** Reject pending member */
  async rejectMember(classId: string, userId: string, targetUserId: string) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Anggota tidak ditemukan.');
    if (member.status !== 'PENDING') throw new ForbiddenException('Anggota sudah aktif.');
    await this.prisma.classMember.delete({ where: { id: member.id } });
    return { message: 'Permintaan bergabung ditolak.' };
  }

  /** Get pending members */
  async getPendingMembers(classId: string, userId: string) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_MEMBERS');
    return this.prisma.classMember.findMany({
      where: { classId, status: 'PENDING' },
      include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
  }

  /** Update class join settings */
  async updateClassSettings(classId: string, userId: string, data: { joinMode?: string; autoRoleAssign?: boolean }) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_CLASS');
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        ...(data.joinMode !== undefined && { joinMode: data.joinMode }),
        ...(data.autoRoleAssign !== undefined && { autoRoleAssign: data.autoRoleAssign }),
      },
    });
  }

  /** Ambil daftar anggota kelas */
  async getClassMembers(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');

    const members = await this.prisma.classMember.findMany({
      where: { classId },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        classRole: true,
      },
      orderBy: { role: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: (m as any).status || 'ACTIVE',
      classRoleId: m.classRoleId,
      classRole: m.classRole,
      user: m.user,
    }));
  }

  /** Ambil semua materi dalam satu kelas, diurutkan berdasarkan sequence pertemuan */
  async getAllClassMaterials(classId: string, userId: string) {
    // Pastikan user adalah member kelas ini
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });

    if (!member) {
      throw new ForbiddenException('Anda bukan anggota kelas ini.');
    }

    return this.prisma.material.findMany({
      where: {
        session: { classId },
      },
      include: {
        session: { select: { title: true, sequence: true } },
      },
      orderBy: [
        { session: { sequence: 'asc' } },
        { createdAt: 'asc' },
      ],
    });
  }

  /** Tambah anggota ke kelas berdasarkan email (hanya OWNER) */
  async addMemberByEmail(classId: string, ownerId: string, email: string) {
    const ownerMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: ownerId } },
    });

    if (!ownerMember || ownerMember.role !== 'OWNER') {
      throw new ForbiddenException('Hanya pemilik kelas yang dapat menambahkan anggota.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      throw new NotFoundException('User dengan email tersebut tidak ditemukan.');
    }

    // Cek apakah sudah terdaftar
    const existing = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: targetUser.id } },
    });

    if (existing) {
      throw new ForbiddenException('User sudah bergabung di kelas ini.');
    }

    const newMember = await this.prisma.classMember.create({
      data: {
        classId,
        userId: targetUser.id,
        role: 'MEMBER',
      },
      include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
    });

    this.logger.log(`User ${targetUser.id} ditambahkan ke kelas ${classId} oleh owner ${ownerId}`);
    return { message: 'Berhasil menambahkan anggota.', member: newMember };
  }

  /** Kick anggota dari kelas (hanya OWNER) */
  async kickMember(classId: string, ownerId: string, userIdToKick: string) {
    const ownerMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: ownerId } },
    });

    if (!ownerMember || ownerMember.role !== 'OWNER') {
      throw new ForbiddenException('Hanya pemilik kelas yang dapat mengeluarkan anggota.');
    }

    if (ownerId === userIdToKick) {
      throw new ForbiddenException('Pemilik kelas tidak dapat mengeluarkan diri sendiri.');
    }

    const targetMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: userIdToKick } },
    });

    if (!targetMember) {
      throw new NotFoundException('Anggota tidak ditemukan.');
    }

    await this.prisma.classMember.delete({
      where: { classId_userId: { classId, userId: userIdToKick } },
    });

    this.logger.log(`User ${userIdToKick} dikeluarkan dari kelas ${classId} oleh owner ${ownerId}`);
    return { message: 'Anggota berhasil dikeluarkan dari kelas.' };
  }

  /** Update role anggota kelas (hanya OWNER) */
  async updateMemberRole(classId: string, ownerId: string, targetUserId: string, newRole: string) {
    const ownerMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: ownerId } },
    });

    if (!ownerMember || ownerMember.role !== 'OWNER') {
      throw new ForbiddenException('Hanya pemilik kelas yang dapat mengubah role anggota.');
    }

    if (ownerId === targetUserId) {
      throw new ForbiddenException('Tidak dapat mengubah role pemilik kelas.');
    }

    const validRoles = ['MEMBER', 'ADMIN'];
    if (!validRoles.includes(newRole)) {
      throw new ForbiddenException('Role tidak valid. Gunakan MEMBER atau ADMIN.');
    }

    const targetMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: targetUserId } },
    });

    if (!targetMember) {
      throw new NotFoundException('Anggota tidak ditemukan.');
    }

    const updated = await this.prisma.classMember.update({
      where: { classId_userId: { classId, userId: targetUserId } },
      data: { role: newRole },
    });

    this.logger.log(`Role user ${targetUserId} di kelas ${classId} diubah menjadi ${newRole} oleh owner ${ownerId}`);
    return { message: `Role berhasil diubah menjadi ${newRole}.`, member: updated };
  }

  /** Join class by code (verifies optional password) */
  async joinByCode(code: string, userId: string, password?: string) {
    const targetClass = await this.prisma.class.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!targetClass) {
      throw new NotFoundException('Kelas dengan kode tersebut tidak ditemukan.');
    }

    // Check if already member
    const existingMember = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: targetClass.id, userId } },
    });

    if (existingMember) {
      return { message: 'Anda sudah bergabung di kelas ini.', role: existingMember.role, classId: targetClass.id };
    }

    // Check password if protected (timing-safe comparison with bcrypt)
    if (targetClass.password) {
      const isMatch = password ? await bcrypt.compare(password.trim(), targetClass.password) : false;
      if (!isMatch) {
        throw new ForbiddenException('Password kelas salah.');
      }
    }

    await this.prisma.classMember.create({
      data: {
        classId: targetClass.id,
        userId,
        role: 'MEMBER',
      },
    });

    this.logger.log(`User ${userId} bergabung ke kelas ${targetClass.name} via kode ${code}`);
    return { message: 'Berhasil bergabung dengan kelas!', classId: targetClass.id };
  }

  /** Get info kelas by code (untuk join modal) */
  async getClassInfoByCode(code: string) {
    const cls = await this.prisma.class.findUnique({
      where: { code: code.toUpperCase().trim() },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { fullName: true } } },
        },
      },
    });

    if (!cls) {
      throw new NotFoundException('Kelas tidak ditemukan.');
    }

    return {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      ownerName: cls.members[0]?.user?.fullName || 'Pengajar',
      hasPassword: cls.password !== null && cls.password !== '',
    };
  }

  // ── CUSTOM TABS CRUD ──

  async getCustomTabs(classId: string, userId: string, discussionId?: string | null) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');

    return this.prisma.classCustomTab.findMany({
      where: { classId, discussionId: discussionId === undefined ? undefined : discussionId },
      orderBy: { createdAt: 'asc' },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async createCustomTab(classId: string, userId: string, name: string, discussionId?: string | null) {
    await this.ensureOwnerOrPermission(classId, userId, 'CANVAS_MANAGE');

    // Max 2 canvas per discussion
    const existing = await this.prisma.classCustomTab.count({
      where: { classId, discussionId: discussionId ?? null },
    });
    if (existing >= 2) throw new BadRequestException('Maksimal 2 canvas per pembahasan.');

    return this.prisma.classCustomTab.create({
      data: { classId, name, content: '', discussionId: discussionId ?? null },
      include: { files: true },
    });
  }

  async updateCustomTab(tabId: string, userId: string, name?: string, content?: string) {
    const tab = await this.prisma.classCustomTab.findUnique({ where: { id: tabId } });
    if (!tab) throw new NotFoundException('Tab tidak ditemukan.');

    // Content updates allowed for all members, name changes require permission
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: tab.classId, userId } },
      include: { classRole: true },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');

    return this.prisma.classCustomTab.update({
      where: { id: tabId },
      data: {
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
      },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async deleteCustomTab(tabId: string, userId: string) {
    const tab = await this.prisma.classCustomTab.findUnique({
      where: { id: tabId },
      include: { files: true },
    });
    if (!tab) throw new NotFoundException('Tab tidak ditemukan.');

    await this.ensureOwnerOrPermission(tab.classId, userId, 'CANVAS_MANAGE');

    // Delete files from storage
    for (const file of tab.files) {
      const path = file.fileUrl.split('/materials/')[1];
      if (path) {
        await this.supabase.storage.from('materials').remove([path]).catch(() => {});
      }
    }

    await this.prisma.classCustomTab.delete({ where: { id: tabId } });
    return { success: true, message: 'Tab berhasil dihapus.' };
  }

  async uploadCustomTabFile(tabId: string, userId: string, file: Express.Multer.File) {
    const tab = await this.prisma.classCustomTab.findUnique({ where: { id: tabId } });
    if (!tab) throw new NotFoundException('Tab tidak ditemukan.');

    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: tab.classId, userId } },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');

    const maxSize = 100 * 1024 * 1024; // ceiling — per-plan limits enforced by FileSizeGuard
    if (file.size > maxSize) throw new BadRequestException('Ukuran file melebihi batas maksimal.');

    const ext = file.originalname.split('.').pop() || 'bin';
    const storagePath = `tabs/${tab.classId}/${tabId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await this.supabase.storage
      .from('materials')
      .upload(storagePath, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw new BadRequestException('Gagal upload file: ' + uploadError.message);

    const { data: urlData } = this.supabase.storage.from('materials').getPublicUrl(storagePath);

    let fileType = 'OTHER';
    if (file.mimetype.startsWith('image/')) fileType = 'IMAGE';
    else if (file.mimetype === 'application/pdf' || file.mimetype.includes('document') || file.mimetype.includes('spreadsheet') || file.mimetype.includes('presentation')) fileType = 'DOCUMENT';

    return this.prisma.classCustomTabFile.create({
      data: {
        tabId,
        fileName: file.originalname,
        fileUrl: urlData.publicUrl,
        fileType,
        fileSizeBytes: file.size,
        uploadedById: userId,
      },
    });
  }

  async deleteCustomTabFile(fileId: string, userId: string) {
    const file = await this.prisma.classCustomTabFile.findUnique({
      where: { id: fileId },
      include: { tab: true },
    });
    if (!file) throw new NotFoundException('File tidak ditemukan.');

    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: file.tab.classId, userId } },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');

    // Delete from storage
    const path = file.fileUrl.split('/materials/')[1];
    if (path) {
      await this.supabase.storage.from('materials').remove([path]).catch(() => {});
    }

    await this.prisma.classCustomTabFile.delete({ where: { id: fileId } });
    return { success: true, message: 'File berhasil dihapus.' };
  }

  // ── CLASS ROLES ──

  static readonly ALL_PERMISSIONS = [
    // Kelas
    'MANAGE_CLASS',     // Edit class info (name, description, etc.)
    'MANAGE_MEMBERS',   // Add/kick members
    'MANAGE_ROLES',     // Create/edit roles, assign roles
    // Pertemuan
    'MANAGE_SESSIONS',  // Create/edit/delete/reorder sessions
    // Materi
    'MATERIAL_UPLOAD',  // Upload materials
    'MATERIAL_DELETE',  // Delete materials
    // Tugas
    'TASK_CREATE',      // Create tasks
    'TASK_EDIT',        // Edit/delete tasks
    // Forum
    'FORUM_DISCUSSION', // Create/edit discussions
    'FORUM_ANNOUNCEMENT', // Create announcements
    'FORUM_REMINDER',   // Create reminders
    'FORUM_POLL',       // Create polls
    'FORUM_PIN',        // Pin/unpin posts
    'FORUM_DELETE',     // Delete any posts/replies
    // Canvas
    'CANVAS_MANAGE',    // Create/edit/delete canvas tabs
    // Kas
    'KAS_CREATE',       // Create new fund
    'KAS_TRANSACTION',  // Add/delete transactions, set target
    // Kelompok
    'GROUP_MANAGE',     // Create/delete groups, manage members
    // Kuis
    'QUIZ_MANAGE',      // Generate/manage quizzes
    // Prediksi Ujian
    'PREDICTION_MANAGE', // Create/delete exam predictions
  ];

  async getClassRoles(classId: string, userId: string) {
    await this.ensureMember(classId, userId);
    return this.prisma.classRole.findMany({
      where: { classId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createClassRole(classId: string, userId: string, name: string, permissions: string[]) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_ROLES');
    const validPerms = permissions.filter(p => ClassService.ALL_PERMISSIONS.includes(p));
    return this.prisma.classRole.create({
      data: { classId, name, permissions: validPerms },
    });
  }

  async updateClassRole(classId: string, userId: string, roleId: string, data: { name?: string; permissions?: string[] }) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_ROLES');
    const role = await this.prisma.classRole.findUnique({ where: { id: roleId } });
    if (!role || role.classId !== classId) throw new NotFoundException('Role tidak ditemukan.');
    if (role.isDefault) throw new ForbiddenException('Role default tidak dapat diedit namanya.');

    return this.prisma.classRole.update({
      where: { id: roleId },
      data: {
        ...(data.name && !role.isDefault ? { name: data.name } : {}),
        ...(data.permissions ? { permissions: data.permissions.filter(p => ClassService.ALL_PERMISSIONS.includes(p)) } : {}),
      },
    });
  }

  async deleteClassRole(classId: string, userId: string, roleId: string) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_ROLES');
    const role = await this.prisma.classRole.findUnique({ where: { id: roleId } });
    if (!role || role.classId !== classId) throw new NotFoundException('Role tidak ditemukan.');
    if (role.isDefault) throw new ForbiddenException('Role default tidak dapat dihapus.');

    // Unassign members from this role first
    await this.prisma.classMember.updateMany({
      where: { classRoleId: roleId },
      data: { classRoleId: null },
    });
    await this.prisma.classRole.delete({ where: { id: roleId } });
    return { success: true, message: 'Role berhasil dihapus.' };
  }

  async assignClassRole(classId: string, userId: string, targetUserId: string, classRoleId: string | null) {
    await this.ensureOwnerOrPermission(classId, userId, 'MANAGE_ROLES');
    const target = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Anggota tidak ditemukan.');

    if (classRoleId) {
      const role = await this.prisma.classRole.findUnique({ where: { id: classRoleId } });
      if (!role || role.classId !== classId) throw new NotFoundException('Role tidak ditemukan.');
    }

    return this.prisma.classMember.update({
      where: { classId_userId: { classId, userId: targetUserId } },
      data: { classRoleId },
      include: { classRole: true, user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async getPermissions() {
    return ClassService.ALL_PERMISSIONS;
  }

  // Helper: ensure user is owner OR has a specific permission via classRole
  private async ensureOwnerOrPermission(classId: string, userId: string, permission: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');
    if (member.role === 'OWNER') return member;
    if (member.classRole?.permissions?.includes(permission)) return member;
    throw new ForbiddenException(`Anda tidak memiliki izin ${permission}.`);
  }

  private async ensureMember(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!member) throw new ForbiddenException('Bukan anggota kelas.');
    return member;
  }
}
