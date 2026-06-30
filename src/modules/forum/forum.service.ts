import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';
import { ForumGateway } from './forum.gateway';
import { NotificationService } from '../notification/notification.service';
import { CreatePostDto, CreateReplyDto, CreateDiscussionDto, UpdateDiscussionDto } from './dto/forum.dto';
import * as sanitizeHtml from 'sanitize-html';

// Whitelist tags that Tiptap editor produces
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'code', 'pre', 'blockquote', 'strike', 's', 'u', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'img', 'hr', 'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    span: ['style'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    code: ['class'],
    pre: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
};

@Injectable()
export class ForumService {
  private readonly logger = new Logger(ForumService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly forumGateway: ForumGateway,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  /** Ambil post dalam kelas (paginated, termasuk vote count) */
  async getClassPosts(classId: string, userId: string, discussionId?: string | null, pagination?: { page?: number; limit?: number }) {
    await this.ensureMember(classId, userId);

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const whereClause = {
      classId,
      discussionId: discussionId === undefined ? null : discussionId,
    };

    const [posts, total] = await Promise.all([
      this.prisma.forumPost.findMany({
        where: whereClause,
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { replies: true, votes: true } },
          votes: { where: { userId }, select: { value: true } },
          attachments: { select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSizeBytes: true, createdAt: true } },
          poll: {
            include: {
              options: { include: { _count: { select: { votes: true } }, votes: { where: { userId }, select: { id: true } } }, orderBy: { order: 'asc' } },
            },
          },
          reminder: { select: { id: true, remindAt: true, sent: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.forumPost.count({ where: whereClause }),
    ]);

    const postIds = posts.map((p) => p.id);
    const voteSums = await this.prisma.forumVote.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds } },
      _sum: { value: true },
    });
    const voteMap = new Map(voteSums.map((v) => [v.postId, v._sum.value || 0]));

    const data = posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      category: p.category,
      isPinned: p.isPinned,
      authorId: p.author.id,
      authorName: p.author.fullName,
      authorAvatar: p.author.avatarUrl,
      replyCount: p._count.replies,
      voteScore: voteMap.get(p.id) || 0,
      userVote: p.votes[0]?.value || 0,
      createdAt: p.createdAt,
      attachments: p.attachments,
      poll: p.poll ? {
        id: p.poll.id,
        question: p.poll.question,
        multiple: p.poll.multiple,
        options: p.poll.options.map((o) => ({ id: o.id, label: o.label, voteCount: o._count.votes })),
        userVotes: p.poll.options.filter((o) => o.votes.length > 0).map((o) => o.id),
      } : undefined,
      reminder: p.reminder || undefined,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Buat post baru */
  async createPost(classId: string, userId: string, dto: CreatePostDto) {
    const member = await this.ensureMember(classId, userId);

    // Sanitize HTML content to prevent XSS
    dto.content = sanitizeHtml(dto.content, SANITIZE_OPTIONS);
    if (dto.title) dto.title = sanitizeHtml(dto.title, { allowedTags: [], allowedAttributes: {} });

    // Hanya user dengan izin FORUM_ANNOUNCEMENT yang boleh buat ANNOUNCEMENT
    if (dto.category === 'ANNOUNCEMENT' && !this.hasPermission(member, 'FORUM_ANNOUNCEMENT')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk membuat pengumuman.');
    }

    // REMINDER requires FORUM_REMINDER
    if (dto.category === 'REMINDER' && !this.hasPermission(member, 'FORUM_REMINDER')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk membuat reminder.');
    }

    // POLL requires FORUM_POLL
    if (dto.category === 'POLL' && !this.hasPermission(member, 'FORUM_POLL')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk membuat polling.');
    }

    const autoTitle = dto.title || dto.content.slice(0, 80).trim();

    const post = await this.prisma.forumPost.create({
      data: {
        classId,
        authorId: userId,
        title: autoTitle,
        content: dto.content,
        category: dto.category || 'DISCUSSION',
        discussionId: dto.discussionId || null,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Create poll if category is POLL
    let poll = null;
    if (dto.category === 'POLL' && dto.pollOptions?.length) {
      poll = await this.prisma.forumPoll.create({
        data: {
          postId: post.id,
          question: autoTitle,
          multiple: dto.pollMultiple || false,
          options: {
            create: dto.pollOptions.map((label, i) => ({ label, order: i })),
          },
        },
        include: { options: { include: { _count: { select: { votes: true } } } } },
      });
    }

    // Create reminder if category is REMINDER
    let reminder = null;
    if (dto.category === 'REMINDER' && dto.remindAt) {
      reminder = await this.prisma.forumReminder.create({
        data: { postId: post.id, remindAt: new Date(dto.remindAt) },
      });
    }

    this.logger.log(`Post forum baru di kelas ${classId} oleh user ${userId}`);
    
    // Kirim notifikasi mention
    await this.notifyMentions(dto.content, classId, userId, autoTitle, post.id);

    // Notify all class members for announcements
    if (dto.category === 'ANNOUNCEMENT') {
      try {
        await this.notificationService.notifyClassMembers(
          classId, userId,
          '📢 Pengumuman Baru',
          `${post.author.fullName}: ${autoTitle}`,
          { category: 'kelas', actionUrl: `/class/${classId}/forum/${post.id}` },
        );
      } catch (e) { this.logger.warn('Notif announcement failed:', e); }
    }

    // Notify for reminders
    if (dto.category === 'REMINDER') {
      try {
        await this.notificationService.notifyClassMembers(
          classId, userId,
          '⏰ Pengingat Baru',
          `${post.author.fullName} membuat pengingat: ${autoTitle}`,
          { category: 'kelas', actionUrl: `/class/${classId}/forum/${post.id}` },
        );
      } catch (e) { this.logger.warn('Notif reminder failed:', e); }
    }

    // Notify for questions
    if (dto.category === 'QUESTION') {
      try {
        await this.notificationService.notifyClassMembers(
          classId, userId,
          '❓ Pertanyaan Baru',
          `${post.author.fullName} mengajukan pertanyaan: ${autoTitle}`,
          { category: 'kelas', actionUrl: `/class/${classId}/forum/${post.id}` },
        );
      } catch (e) { this.logger.warn('Notif question failed:', e); }
    }

    // Notify for polls
    if (dto.category === 'POLL') {
      try {
        await this.notificationService.notifyClassMembers(
          classId, userId,
          '📊 Voting Baru',
          `${post.author.fullName} membuat voting: ${autoTitle}`,
          { category: 'kelas', actionUrl: `/class/${classId}/forum/${post.id}` },
        );
      } catch (e) { this.logger.warn('Notif poll failed:', e); }
    }

    const postResult = {
      id: post.id,
      classId: post.classId,
      title: post.title,
      content: post.content,
      category: post.category,
      isPinned: post.isPinned,
      authorId: post.author.id,
      authorName: post.author.fullName,
      authorAvatar: post.author.avatarUrl,
      discussionId: post.discussionId,
      replyCount: 0,
      voteScore: 0,
      userVote: 0,
      createdAt: post.createdAt,
      poll: poll ? {
        id: poll.id,
        question: poll.question,
        multiple: poll.multiple,
        options: poll.options.map((o) => ({ id: o.id, label: o.label, voteCount: 0 })),
        userVotes: [],
      } : undefined,
      reminder: reminder ? { id: reminder.id, remindAt: reminder.remindAt, sent: false } : undefined,
    };

    // Emit via Socket.IO to all clients in the class room
    this.forumGateway.emitNewPost(classId, postResult);

    return postResult;
  }

  /** Ambil detail post dengan semua reply */
  async getPostDetail(postId: string, userId: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        replies: {
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
            votes: { where: { userId }, select: { value: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        votes: { where: { userId }, select: { value: true } },
      },
    });

    if (!post) throw new NotFoundException('Post tidak ditemukan.');
    await this.ensureMember(post.classId, userId);

    // Hitung vote scores
    const postVoteSum = await this.prisma.forumVote.aggregate({
      where: { postId },
      _sum: { value: true },
    });

    const replyIds = post.replies.map((r) => r.id);
    const replyVoteSums = await this.prisma.forumVote.groupBy({
      by: ['replyId'],
      where: { replyId: { in: replyIds } },
      _sum: { value: true },
    });
    const replyVoteMap = new Map(replyVoteSums.map((v) => [v.replyId, v._sum.value || 0]));

    return {
      id: post.id,
      classId: post.classId,
      title: post.title,
      content: post.content,
      category: post.category,
      isPinned: post.isPinned,
      authorId: post.author.id,
      authorName: post.author.fullName,
      authorAvatar: post.author.avatarUrl,
      voteScore: postVoteSum._sum.value || 0,
      userVote: post.votes[0]?.value || 0,
      createdAt: post.createdAt,
      replies: post.replies.map((r) => ({
        id: r.id,
        content: r.content,
        authorId: r.author.id,
        authorName: r.author.fullName,
        authorAvatar: r.author.avatarUrl,
        voteScore: replyVoteMap.get(r.id) || 0,
        userVote: r.votes[0]?.value || 0,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Balas post */
  async replyToPost(postId: string, userId: string, dto: CreateReplyDto) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: { class: true },
    });
    if (!post) throw new NotFoundException('Post tidak ditemukan.');
    await this.ensureMember(post.classId, userId);

    // Sanitize reply content
    dto.content = sanitizeHtml(dto.content, SANITIZE_OPTIONS);

    const reply = await this.prisma.forumReply.create({
      data: {
        postId,
        authorId: userId,
        content: dto.content,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Kirim notifikasi mention
    await this.notifyMentions(dto.content, post.classId, userId, `Balasan di "${post.title}"`, post.id);

    // Notify post author about new reply (don't notify yourself)
    if (post.authorId !== userId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: post.authorId },
      });
      if (!pref || pref.forumReply) {
        const replierName = reply.author.fullName || 'Seseorang';
        this.notificationService.createNotification(
          post.authorId,
          '💬 Balasan Baru',
          `${replierName} membalas postmu "${post.title.slice(0, 40)}"`,
          { category: 'kelas', actionUrl: `/class/${post.classId}/forum/${post.id}` },
        ).catch(() => {});
      }
    }

    const replyResult = {
      id: reply.id,
      content: reply.content,
      authorId: reply.author.id,
      authorName: reply.author.fullName,
      authorAvatar: reply.author.avatarUrl,
      voteScore: 0,
      userVote: 0,
      createdAt: reply.createdAt,
    };

    // Emit via Socket.IO
    this.forumGateway.emitNewReply(post.classId, postId, replyResult);

    return replyResult;
  }

  /** Vote pada post atau reply (+1 upvote, -1 downvote, toggle off if same) */
  async vote(userId: string, postId: string | null, replyId: string | null, value: number) {
    if (!postId && !replyId) {
      throw new BadRequestException('Harus menyertakan postId atau replyId.');
    }
    const voteValue = value > 0 ? 1 : -1;

    if (postId) {
      const post = await this.prisma.forumPost.findUnique({ where: { id: postId } });
      if (!post) throw new NotFoundException('Post tidak ditemukan.');
      await this.ensureMember(post.classId, userId);

      const existing = await this.prisma.forumVote.findUnique({
        where: { userId_postId: { userId, postId } },
      });

      if (existing) {
        if (existing.value === voteValue) {
          // Toggle off - hapus vote
          await this.prisma.forumVote.delete({ where: { id: existing.id } });
          return { voteValue: 0 };
        }
        // Change vote direction
        await this.prisma.forumVote.update({ where: { id: existing.id }, data: { value: voteValue } });
        return { voteValue };
      }

      await this.prisma.forumVote.create({
        data: { userId, postId, value: voteValue },
      });

      // Notify post author on upvote (not downvote, not self-vote)
      if (voteValue === 1 && post.authorId !== userId) {
        const voter = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        this.notificationService.createNotification(
          post.authorId,
          '👍 Post Kamu Di-upvote!',
          `${voter?.fullName || 'Seseorang'} upvote postmu "${post.title.slice(0, 40)}".`,
          { category: 'forum', actionUrl: `/class/${post.classId}/forum/${post.id}` },
        ).catch(() => {});
      }

      return { voteValue };
    }

    if (replyId) {
      const reply = await this.prisma.forumReply.findUnique({
        where: { id: replyId },
        include: { post: true },
      });
      if (!reply) throw new NotFoundException('Balasan tidak ditemukan.');
      await this.ensureMember(reply.post.classId, userId);

      const existing = await this.prisma.forumVote.findUnique({
        where: { userId_replyId: { userId, replyId } },
      });

      if (existing) {
        if (existing.value === voteValue) {
          await this.prisma.forumVote.delete({ where: { id: existing.id } });
          return { voteValue: 0 };
        }
        await this.prisma.forumVote.update({ where: { id: existing.id }, data: { value: voteValue } });
        return { voteValue };
      }

      await this.prisma.forumVote.create({
        data: { userId, replyId, value: voteValue },
      });

      // Notify reply author on upvote
      if (voteValue === 1 && reply.authorId !== userId) {
        const voter = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        this.notificationService.createNotification(
          reply.authorId,
          '👍 Balasan Kamu Di-upvote!',
          `${voter?.fullName || 'Seseorang'} upvote balasanmu di "${reply.post.title.slice(0, 40)}".`,
          { category: 'forum', actionUrl: `/class/${reply.post.classId}/forum/${reply.post.id}` },
        ).catch(() => {});
      }

      return { voteValue };
    }

    return { voteValue: 0 };
  }

  /** Hapus post (hanya author atau owner kelas) */
  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: { class: { include: { members: { where: { userId }, include: { classRole: true } } } } },
    });

    if (!post) throw new NotFoundException('Post tidak ditemukan.');

    const member = post.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');

    if (post.authorId !== userId && !this.hasPermission(member, 'FORUM_DELETE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus post ini.');
    }

    await this.prisma.forumPost.delete({ where: { id: postId } });

    // Emit via Socket.IO
    this.forumGateway.emitPostDeleted(post.classId, postId);

    return { message: 'Post berhasil dihapus.' };
  }

  /** Hapus reply (hanya author atau yang punya izin) */
  async deleteReply(replyId: string, userId: string) {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id: replyId },
      include: { post: { include: { class: { include: { members: { where: { userId }, include: { classRole: true } } } } } } },
    });

    if (!reply) throw new NotFoundException('Balasan tidak ditemukan.');

    const member = reply.post.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');

    if (reply.authorId !== userId && !this.hasPermission(member, 'FORUM_DELETE')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus balasan ini.');
    }

    await this.prisma.forumReply.delete({ where: { id: replyId } });
    return { message: 'Balasan berhasil dihapus.' };
  }

  /** Pin/unpin post (requires FORUM_PIN permission) */
  async togglePinPost(postId: string, userId: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: { class: { include: { members: { where: { userId }, include: { classRole: true } } } } },
    });

    if (!post) throw new NotFoundException('Post tidak ditemukan.');
    const member = post.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (!this.hasPermission(member, 'FORUM_PIN')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk pin post.');
    }

    const updated = await this.prisma.forumPost.update({
      where: { id: postId },
      data: { isPinned: !post.isPinned },
    });

    // Emit via Socket.IO
    this.forumGateway.emitPinToggled(post.classId, postId, updated.isPinned);

    // Notify post author when someone pins their post
    if (updated.isPinned && post.authorId !== userId) {
      try {
        const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        await this.notificationService.createNotification(
          post.authorId,
          '📌 Pesan Disematkan',
          `${actor?.fullName || 'Seseorang'} menyematkan pesan Anda: "${post.title?.slice(0, 50)}"`,
          { category: 'kelas', actionUrl: `/class/${post.classId}/forum/${postId}` },
        );
      } catch (e) { this.logger.warn('Notif pin failed:', e); }
    }

    return { isPinned: updated.isPinned };
  }

  // ─── Discussions (Pembahasan) ───────────────────────────────────────
  async getClassDiscussions(classId: string, userId: string) {
    const member = await this.ensureMember(classId, userId);
    const discussions = await this.prisma.forumDiscussion.findMany({
      where: { classId },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        task: { select: { id: true, title: true, assignType: true, taskGroup: { select: { id: true, name: true } } } },
        session: { select: { id: true, title: true, sequence: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter discussions by assignment (users with FORUM_DISCUSSION see all)
    const canManageForum = this.hasPermission(member, 'FORUM_DISCUSSION');
    const filtered = canManageForum ? discussions : discussions.filter((d) => {
      if (d.assignType === 'ALL' || !d.assignType) return true;
      if (d.assignType === 'INDIVIDUAL') return d.assignedUserIds.includes(userId) || d.authorId === userId;
      if (d.assignType === 'GROUP' && d.assignedGroupId) {
        // Will be checked against TaskGroupMember
        return true; // We'll filter below
      }
      return true;
    });

    // For GROUP type, check membership
    const groupDiscIds = filtered.filter(d => d.assignType === 'GROUP' && d.assignedGroupId).map(d => d.assignedGroupId!);
    let userGroupIds: string[] = [];
    if (groupDiscIds.length > 0) {
      const memberships = await this.prisma.taskGroupMember.findMany({
        where: { userId, groupId: { in: groupDiscIds } },
        select: { groupId: true },
      });
      userGroupIds = memberships.map(m => m.groupId);
    }

    const finalDiscussions = canManageForum ? filtered : filtered.filter((d) => {
      if (d.assignType === 'GROUP' && d.assignedGroupId) {
        return userGroupIds.includes(d.assignedGroupId) || d.authorId === userId;
      }
      return true;
    });

    return finalDiscussions.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      taskId: d.taskId,
      task: d.task ? { id: d.task.id, title: d.task.title, assignType: d.task.assignType, groupName: d.task.taskGroup?.name } : undefined,
      sessionId: d.sessionId,
      session: d.session ? { id: d.session.id, title: d.session.title, sequence: d.session.sequence } : undefined,
      assignType: d.assignType,
      assignedUserIds: d.assignedUserIds,
      assignedGroupId: d.assignedGroupId,
      authorId: d.author.id,
      authorName: d.author.fullName,
      postCount: d._count.posts,
      createdAt: d.createdAt,
    }));
  }

  async createDiscussion(classId: string, userId: string, dto: CreateDiscussionDto) {
    await this.ensureMember(classId, userId);
    const discussion = await this.prisma.forumDiscussion.create({
      data: {
        classId,
        authorId: userId,
        title: dto.title,
        description: dto.description,
        taskId: dto.taskId || null,
        sessionId: dto.sessionId || null,
        assignType: dto.assignType || 'ALL',
        assignedUserIds: dto.assignedUserIds || [],
        assignedGroupId: dto.assignedGroupId || null,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        task: { select: { id: true, title: true, assignType: true, taskGroup: { select: { id: true, name: true } } } },
        session: { select: { id: true, title: true, sequence: true } },
      },
    });
    return {
      id: discussion.id,
      title: discussion.title,
      description: discussion.description,
      taskId: discussion.taskId,
      task: discussion.task ? { id: discussion.task.id, title: discussion.task.title, assignType: discussion.task.assignType, groupName: discussion.task.taskGroup?.name } : undefined,
      sessionId: discussion.sessionId,
      session: discussion.session ? { id: discussion.session.id, title: discussion.session.title, sequence: discussion.session.sequence } : undefined,
      assignType: discussion.assignType,
      assignedUserIds: discussion.assignedUserIds,
      assignedGroupId: discussion.assignedGroupId,
      authorId: discussion.author.id,
      authorName: discussion.author.fullName,
      postCount: 0,
      createdAt: discussion.createdAt,
    };
  }

  async updateDiscussion(discussionId: string, userId: string, dto: UpdateDiscussionDto) {
    const discussion = await this.prisma.forumDiscussion.findUnique({
      where: { id: discussionId },
      include: { class: { include: { members: { where: { userId }, include: { classRole: true } } } } },
    });
    if (!discussion) throw new NotFoundException('Pembahasan tidak ditemukan.');
    const member = discussion.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (discussion.authorId !== userId && !this.hasPermission(member, 'FORUM_DISCUSSION')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk mengedit pembahasan ini.');
    }
    const updated = await this.prisma.forumDiscussion.update({
      where: { id: discussionId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.assignType !== undefined && { assignType: dto.assignType }),
        ...(dto.assignedUserIds !== undefined && { assignedUserIds: dto.assignedUserIds }),
        ...(dto.assignedGroupId !== undefined && { assignedGroupId: dto.assignedGroupId || null }),
      },
    });
    return { ...updated };
  }

  async deleteDiscussion(discussionId: string, userId: string) {
    const discussion = await this.prisma.forumDiscussion.findUnique({
      where: { id: discussionId },
      include: { class: { include: { members: { where: { userId }, include: { classRole: true } } } } },
    });
    if (!discussion) throw new NotFoundException('Pembahasan tidak ditemukan.');
    if (discussion.isDefault) throw new ForbiddenException('Pembahasan default tidak dapat dihapus.');
    const member = discussion.class.members[0];
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    if (discussion.authorId !== userId && !this.hasPermission(member, 'FORUM_DISCUSSION')) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk menghapus pembahasan ini.');
    }
    await this.prisma.forumDiscussion.delete({ where: { id: discussionId } });
    return { message: 'Pembahasan berhasil dihapus.' };
  }

  private async ensureMember(classId: string, userId: string) {
    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      include: { classRole: true },
    });
    if (!member) throw new ForbiddenException('Anda bukan anggota kelas ini.');
    return member;
  }

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }

  // ─── Poll Voting ──────────────────────────────────────────────────────
  async votePoll(optionId: string, userId: string) {
    const option = await this.prisma.forumPollOption.findUnique({
      where: { id: optionId },
      include: { poll: { include: { post: true } } },
    });
    if (!option) throw new NotFoundException('Opsi tidak ditemukan.');
    await this.ensureMember(option.poll.post.classId, userId);

    const existing = await this.prisma.forumPollVote.findUnique({
      where: { optionId_userId: { optionId, userId } },
    });

    if (existing) {
      // Toggle off
      await this.prisma.forumPollVote.delete({ where: { id: existing.id } });
      return { voted: false, optionId };
    }

    // If not multiple, remove previous votes on this poll
    if (!option.poll.multiple) {
      const allOptionIds = (await this.prisma.forumPollOption.findMany({
        where: { pollId: option.pollId },
        select: { id: true },
      })).map((o) => o.id);
      await this.prisma.forumPollVote.deleteMany({
        where: { userId, optionId: { in: allOptionIds } },
      });
    }

    await this.prisma.forumPollVote.create({ data: { optionId, userId } });
    return { voted: true, optionId };
  }

  // ─── Attachments ──────────────────────────────────────────────────────
  async addAttachment(postId: string | null, replyId: string | null, data: {
    fileName: string; fileUrl: string; fileType: string; fileSizeBytes?: number; uploaderName?: string;
  }) {
    return this.prisma.forumAttachment.create({
      data: { postId, replyId, ...data },
    });
  }

  async getClassAttachments(classId: string, userId: string) {
    await this.ensureMember(classId, userId);
    return this.prisma.forumAttachment.findMany({
      where: {
        OR: [
          { post: { classId } },
          { reply: { post: { classId } } },
        ],
      },
      include: {
        post: { select: { id: true, authorId: true, author: { select: { fullName: true } } } },
        reply: { select: { id: true, authorId: true, author: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async notifyMentions(content: string, classId: string, authorId: string, contextTitle: string, postId: string) {
    const matches = content.match(/@(\w+)/g);
    if (!matches) return;

    const prefixes = matches.map((m) => m.substring(1).toLowerCase());
    if (prefixes.length === 0) return;

    const classMembers = await this.prisma.classMember.findMany({
      where: { classId },
      include: { user: true },
    });

    const mentionedMembers = classMembers.filter((m) => {
      if (m.userId === authorId) return false;
      const emailPrefix = m.user.email.split('@')[0].toLowerCase();
      const cleanFullName = m.user.fullName.replace(/\s+/g, '').toLowerCase();
      return prefixes.some((p) => emailPrefix.includes(p) || cleanFullName.includes(p));
    });

    for (const mm of mentionedMembers) {
      await this.notificationService.createNotification(
        mm.userId,
        'Anda disebut di Forum',
        `Seseorang menyebut Anda di forum: "${contextTitle}"`,
        { category: 'kelas', actionUrl: `/class/${classId}/forum/${postId}` },
      );
    }
  }

  /** Upload file for forum (uses service role key to bypass RLS) */
  async uploadForumFile(classId: string, userId: string, file: Express.Multer.File) {
    await this.ensureMember(classId, userId);
    if (!file) throw new BadRequestException('File tidak ditemukan.');

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Hanya gambar (jpg/png/gif/webp) dan PDF yang diizinkan.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Ukuran file maksimal 10MB.');
    }

    const ext = file.originalname.split('.').pop();
    const path = `forum/${classId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Ensure bucket exists before uploading
    const bucketName = 'materials';
    await this.ensureBucketExists(bucketName);

    const { error: uploadError } = await this.supabase.storage
      .from(bucketName)
      .upload(path, file.buffer, { contentType: file.mimetype });

    if (uploadError) {
      this.logger.error('Forum file upload error:', uploadError);
      throw new BadRequestException('Gagal upload file: ' + uploadError.message);
    }

    const { data: urlData } = this.supabase.storage.from(bucketName).getPublicUrl(path);

    return {
      fileUrl: urlData.publicUrl,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSizeBytes: file.size,
    };
  }

  /** Ensure a storage bucket exists, create it if not */
  private async ensureBucketExists(bucketName: string) {
    const { data, error } = await this.supabase.storage.getBucket(bucketName);
    if (error || !data) {
      const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
      });
      if (createError && !createError.message?.includes('already exists')) {
        this.logger.error(`Failed to create bucket '${bucketName}':`, createError);
        throw new BadRequestException('Storage belum siap. Silakan coba lagi.');
      }
    }
  }

  // ── UNREAD TRACKING ──

  /** Mark a discussion as read */
  async markAsRead(classId: string, userId: string, discussionId: string | null) {
    // Find existing read status
    const existing = await this.prisma.forumReadStatus.findFirst({
      where: { userId, classId, discussionId },
    });
    if (existing) {
      await this.prisma.forumReadStatus.update({
        where: { id: existing.id },
        data: { lastReadAt: new Date() },
      });
    } else {
      await this.prisma.forumReadStatus.create({
        data: { userId, classId, discussionId, lastReadAt: new Date() },
      });
    }
    return { success: true };
  }

  /** Get unread counts per discussion for a class */
  async getUnreadCounts(classId: string, userId: string) {
    // Get all read statuses for user in this class
    const readStatuses = await this.prisma.forumReadStatus.findMany({
      where: { userId, classId },
    });
    const readMap = new Map<string, Date>();
    for (const rs of readStatuses) {
      readMap.set(rs.discussionId || '__umum__', rs.lastReadAt);
    }

    // Get discussions the user can see
    const discussions = await this.prisma.forumDiscussion.findMany({
      where: { classId },
      select: { id: true },
    });

    // Count unread for Umum (discussionId = null)
    const umumLastRead = readMap.get('__umum__');
    const umumUnread = await this.prisma.forumPost.count({
      where: {
        classId,
        discussionId: null,
        ...(umumLastRead ? { createdAt: { gt: umumLastRead } } : {}),
        authorId: { not: userId },
      },
    });

    // Count unread for each discussion
    const counts: Record<string, number> = {};
    if (umumUnread > 0) counts['__umum__'] = umumUnread;

    for (const disc of discussions) {
      const lastRead = readMap.get(disc.id);
      const unread = await this.prisma.forumPost.count({
        where: {
          classId,
          discussionId: disc.id,
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
          authorId: { not: userId },
        },
      });
      if (unread > 0) counts[disc.id] = unread;
    }

    return counts;
  }
}
