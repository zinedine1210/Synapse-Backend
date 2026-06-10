import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  private readonly supabase: SupabaseClient;
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  private async ensureMember(classId: string, userId: string) {
    const m = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId } }, include: { classRole: true } });
    if (!m) throw new ForbiddenException('Bukan anggota kelas.');
    return m;
  }

  private hasPermission(member: any, perm: string): boolean {
    if (member.role === 'OWNER') return true;
    return member.classRole?.permissions?.includes(perm) ?? false;
  }

  /** Get all tasks for a class */
  async getClassTasks(classId: string, userId: string) {
    const member = await this.ensureMember(classId, userId);
    const tasks = await this.prisma.task.findMany({
      where: { classId },
      include: {
        session: { select: { id: true, title: true, sequence: true } },
        _count: { select: { submissions: true } },
        taskGroup: { include: { members: true } },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    });

    if (this.hasPermission(member, 'TASK_CREATE')) {
      return tasks;
    }

    return tasks.filter((task) => {
      if (task.assignType === 'ALL') return true;
      if (task.assignType === 'INDIVIDUAL') {
        return task.assignedUserIds.includes(userId);
      }
      if (task.assignType === 'GROUP' && task.taskGroupId) {
        return task.taskGroup?.members.some((m) => m.userId === userId);
      }
      return false;
    });
  }

  /** Get tasks for a specific session */
  async getSessionTasks(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan.');
    const member = await this.ensureMember(session.classId, userId);
    
    const tasks = await this.prisma.task.findMany({
      where: { sessionId },
      include: {
        _count: { select: { submissions: true } },
        taskGroup: { include: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (this.hasPermission(member, 'TASK_CREATE')) {
      return tasks;
    }

    return tasks.filter((task) => {
      if (task.assignType === 'ALL') return true;
      if (task.assignType === 'INDIVIDUAL') {
        return task.assignedUserIds.includes(userId);
      }
      if (task.assignType === 'GROUP' && task.taskGroupId) {
        return task.taskGroup?.members.some((m) => m.userId === userId);
      }
      return false;
    });
  }

  /** Create task with flexible assignments */
  async createTask(classId: string, userId: string, data: {
    title: string;
    description?: string;
    sessionId?: string;
    taskType?: string;
    deadline?: string;
    taskGroupId?: string;
    visibility?: string;
    assignType?: string;
    assignedUserIds?: string[];
    imageBase64?: string;
    imageMimeType?: string;
  }) {
    await this.ensureMember(classId, userId);

    let descriptionImageUrl: string | null = null;
    let description = data.description;

    // Upload task description image if provided
    if (data.imageBase64 && data.imageMimeType) {
      try {
        const ext = (data.imageMimeType.split('/')[1] || 'png').replace(/[^a-zA-Z0-9]/g, '');
        const fileName = `tasks/${classId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const buffer = Buffer.from(data.imageBase64, 'base64');
        // Limit image size to 5MB
        if (buffer.byteLength > 5 * 1024 * 1024) {
          this.logger.warn('Task image too large, skipping upload');
        } else {
        const { error: uploadErr } = await this.supabase.storage.from('materials').upload(fileName, buffer, { contentType: data.imageMimeType });
        if (!uploadErr) {
          const { data: urlData } = this.supabase.storage.from('materials').getPublicUrl(fileName);
          descriptionImageUrl = urlData.publicUrl;
        }

        // AI: extract/generate description from the image
        if (!description || !description.trim()) {
          try {
            const prompt = 'Kamu adalah asisten pendidikan. Analisis gambar soal/tugas berikut dan buat deskripsi ringkas dalam Bahasa Indonesia yang menjelaskan isi soal/tugas tersebut. Cukup deskripsi singkat saja (1-3 kalimat). Jangan jawab soalnya.';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
            const apiKey = this.configService.get<string>('GEMINI_API_KEY');
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey! },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { data: data.imageBase64, mime_type: data.imageMimeType } }] }],
              }),
            });
            if (resp.ok) {
              const json = await resp.json();
              description = json.candidates?.[0]?.content?.parts?.[0]?.text || description;
            }
          } catch (e) { this.logger.warn('AI description generation failed:', e); }
        }
        } // close else for size check
      } catch (e) { this.logger.warn('Image upload failed:', e); }
    }

    const task = await this.prisma.task.create({
      data: {
        classId,
        createdById: userId,
        title: data.title,
        description,
        descriptionImageUrl,
        sessionId: data.sessionId || null,
        taskType: (data.taskType as any) || 'MIXED',
        deadline: data.deadline ? new Date(data.deadline) : null,
        taskGroupId: data.taskGroupId || null,
        visibility: (data.visibility as any) || 'SHARED',
        assignType: data.assignType || 'ALL',
        assignedUserIds: data.assignedUserIds || [],
      },
      include: {
        session: { select: { id: true, title: true, sequence: true } },
        taskGroup: { select: { id: true, name: true } },
      },
    });

    // Notify class members about new task
    try {
      await this.notificationService.notifyClassMembers(
        classId, userId,
        '📋 Tugas Baru',
        `Tugas baru: "${data.title}"${data.deadline ? ` - Deadline: ${new Date(data.deadline).toLocaleDateString('id-ID')}` : ''}`,
      );
    } catch (e) { this.logger.warn('Notif task failed:', e); }

    return task;
  }

  /** Get user deadlines across all classes */
  async myDeadlines(userId: string) {
    const memberships = await this.prisma.classMember.findMany({
      where: { userId },
    });
    const classIds = memberships.map((m) => m.classId);

    const tasks = await this.prisma.task.findMany({
      where: {
        classId: { in: classIds },
        deadline: { gte: new Date() },
      },
      include: {
        class: { select: { id: true, name: true } },
        session: { select: { id: true, title: true, sequence: true } },
        taskGroup: { include: { members: true } },
        submissions: { where: { userId } },
      },
      orderBy: { deadline: 'asc' },
    });

    return tasks.filter((task) => {
      const m = memberships.find((memb) => memb.classId === task.classId);
      if (!m) return false;
      if (m.role === 'OWNER') return true;
      if (task.assignType === 'ALL') return true;
      if (task.assignType === 'INDIVIDUAL') {
        return task.assignedUserIds.includes(userId);
      }
      if (task.assignType === 'GROUP' && task.taskGroupId) {
        return task.taskGroup?.members.some((gMemb) => gMemb.userId === userId);
      }
      return false;
    });
  }

  /** Delete task */
  async deleteTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan.');
    const member = await this.ensureMember(task.classId, userId);
    if (task.createdById !== userId && !this.hasPermission(member, 'TASK_EDIT')) throw new ForbiddenException('Tidak diizinkan.');
    await this.prisma.task.delete({ where: { id: taskId } });
    return { message: 'Tugas dihapus.' };
  }

  /** Update task */
  async updateTask(taskId: string, userId: string, data: {
    title?: string;
    description?: string;
    sessionId?: string;
    taskType?: string;
    deadline?: string;
    taskGroupId?: string;
    visibility?: string;
    assignType?: string;
    assignedUserIds?: string[];
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan.');
    const member = await this.ensureMember(task.classId, userId);
    if (task.createdById !== userId && !this.hasPermission(member, 'TASK_EDIT')) throw new ForbiddenException('Tidak diizinkan.');
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sessionId !== undefined && { sessionId: data.sessionId || null }),
        ...(data.taskType !== undefined && { taskType: data.taskType as any }),
        ...(data.deadline !== undefined && { deadline: data.deadline ? new Date(data.deadline) : null }),
        ...(data.taskGroupId !== undefined && { taskGroupId: data.taskGroupId || null }),
        ...(data.visibility !== undefined && { visibility: data.visibility as any }),
        ...(data.assignType !== undefined && { assignType: data.assignType }),
        ...(data.assignedUserIds !== undefined && { assignedUserIds: data.assignedUserIds }),
      },
      include: {
        session: { select: { id: true, title: true, sequence: true } },
        taskGroup: { select: { id: true, name: true } },
      },
    });
  }

  /** Submit task (text or image) — optionally get AI answer */
  async submitTask(taskId: string, userId: string, data: { content?: string; imageUrl?: string; imageBase64?: string; imageMimeType?: string; visibility?: string; skipAi?: boolean }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan.');
    await this.ensureMember(task.classId, userId);

    // If skipAi is true, just save the answer without AI processing
    if (data.skipAi) {
      return this.prisma.taskSubmission.create({
        data: {
          taskId,
          userId,
          content: data.content || null,
          imageUrl: data.imageUrl || null,
          aiAnswer: null,
          visibility: data.visibility || 'PRIVATE',
        },
      });
    }

    // Get class materials context for better AI answers
    const materials = await this.prisma.material.findMany({
      where: { session: { classId: task.classId }, status: 'SUCCESS', aiSummary: { not: null } },
      select: { aiSummary: true },
      take: 5,
    });
    const context = materials.map((m) => m.aiSummary).join('\n\n');

    let aiAnswer = '';

    if (data.imageBase64) {
      // 1. Ekstrak pertanyaan-pertanyaan dari gambar (split nomor soal)
      try {
        const questions = await this.aiService.extractQuestionsFromImage(data.imageBase64, data.imageMimeType || 'image/jpeg');
        if (questions && questions.length > 1) {
          // Solve multi-section
          const solvedSections = await this.aiService.solveMultiSection(questions, context);
          aiAnswer = solvedSections
            .map((s, idx) => `### Soal ${idx + 1}\n**Soal:** ${s.question}\n\n**Jawaban:**\n${s.answer}`)
            .join('\n\n---\n\n');
        } else {
          // Single question or fallback
          aiAnswer = await this.solveFromBase64(data.imageBase64, data.imageMimeType || 'image/jpeg', context);
        }
      } catch (err) {
        this.logger.error('Multi-section image solving failed, falling back...', err);
        aiAnswer = await this.solveFromBase64(data.imageBase64, data.imageMimeType || 'image/jpeg', context);
      }
    } else if (data.content) {
      // Split text by number prefixes e.g. "1. X\n2. Y"
      const lines = data.content.split('\n');
      const questionsList: string[] = [];
      let currentQuestion = '';

      for (const line of lines) {
        if (/^\d+[\.\)]/i.test(line.trim())) {
          if (currentQuestion) questionsList.push(currentQuestion.trim());
          currentQuestion = line;
        } else {
          currentQuestion += '\n' + line;
        }
      }
      if (currentQuestion) questionsList.push(currentQuestion.trim());

      if (questionsList.length > 1) {
        // Multi-section text solving
        const solvedSections = await this.aiService.solveMultiSection(questionsList, context || undefined);
        aiAnswer = solvedSections
          .map((s, idx) => `### Soal ${idx + 1}\n**Soal:** ${s.question}\n\n**Jawaban:**\n${s.answer}`)
          .join('\n\n---\n\n');
      } else {
        // Single text question
        aiAnswer = await this.aiService.solveQuestion(data.content, context || undefined);
      }
    } else if (data.imageUrl) {
      // Image URL
      aiAnswer = await this.solveFromImage(data.imageUrl, context);
    }

    return this.prisma.taskSubmission.create({
      data: {
        taskId,
        userId,
        content: data.content || null,
        imageUrl: data.imageUrl || null,
        aiAnswer,
        visibility: data.visibility || 'PRIVATE',
      },
    });
  }

  /** Get submissions for a task (own + public from others) */
  async getSubmissions(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan.');
    await this.ensureMember(task.classId, userId);
    return this.prisma.taskSubmission.findMany({
      where: {
        taskId,
        OR: [
          { userId },
          { visibility: 'PUBLIC' },
        ],
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Toggle submission visibility */
  async toggleSubmissionVisibility(submissionId: string, userId: string) {
    const sub = await this.prisma.taskSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('Submission tidak ditemukan.');
    if (sub.userId !== userId) throw new ForbiddenException('Hanya pemilik submission yang dapat mengubah visibilitas.');
    const newVisibility = sub.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    return this.prisma.taskSubmission.update({
      where: { id: submissionId },
      data: { visibility: newVisibility },
    });
  }

  /** Delete a submission (only owner of submission or class owner) */
  async deleteSubmission(submissionId: string, userId: string) {
    const submission = await this.prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });
    if (!submission) throw new NotFoundException('Submission tidak ditemukan.');
    const member = await this.ensureMember(submission.task.classId, userId);
    if (submission.userId !== userId && !this.hasPermission(member, 'TASK_EDIT')) throw new ForbiddenException('Tidak diizinkan.');
    await this.prisma.taskSubmission.delete({ where: { id: submissionId } });
    return { message: 'Riwayat jawaban dihapus.' };
  }

  /** AI: solve question from image URL (with SSRF protection) */
  private async solveFromImage(imageUrl: string, context: string): Promise<string> {
    this.logger.log('Solving task question from image URL via AI...');

    // SSRF protection: only allow HTTPS URLs from known domains
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:') {
        return 'URL gambar harus menggunakan HTTPS.';
      }
      // Block private/internal IPs
      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.endsWith('.internal') ||
        hostname === '0.0.0.0' ||
        hostname === '169.254.169.254' // AWS metadata
      ) {
        return 'URL gambar tidak valid.';
      }
    } catch {
      return 'Format URL gambar tidak valid.';
    }

    try {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
      const buffer = await response.arrayBuffer();
      // Limit response size to 10MB
      if (buffer.byteLength > 10 * 1024 * 1024) {
        return 'Gambar terlalu besar (maksimal 10MB).';
      }
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      return this.solveFromBase64(base64, mimeType, context);
    } catch (err) {
      this.logger.error('Failed to fetch image:', err);
      return 'Gagal memproses gambar soal. Coba lagi atau ketik manual.';
    }
  }

  /** AI: solve question from base64 image data */
  private async solveFromBase64(base64: string, mimeType: string, context: string): Promise<string> {
    this.logger.log('Solving task question from image via Gemini vision...');
    try {
      let prompt = 'Kamu adalah asisten belajar cerdas untuk mahasiswa. Analisis gambar soal berikut dan jawab SEMUA pertanyaan yang ada.\n\n';
      if (context) {
        prompt += 'PERTAMA, cari jawaban dari konteks materi kuliah berikut:\n---\n' + context.slice(0, 8000) + '\n---\n\nJika jawabannya TIDAK ditemukan dalam konteks materi di atas, gunakan pengetahuan umummu untuk menjawab.\n\n';
      } else {
        prompt += 'Gunakan pengetahuan umummu untuk menjawab.\n\n';
      }
      prompt += 'Untuk setiap soal:\n- Jika pilihan ganda: tentukan jawaban yang benar beserta penjelasan lengkap\n- Jika essay: berikan jawaban lengkap dan terstruktur\n- Tulis jawaban secara rapi menggunakan heading dan bullet point\n\nFormat jawaban dalam Markdown yang rapi. Gunakan Bahasa Indonesia.';

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey! },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { data: base64, mime_type: mimeType } },
            ],
          }],
        }),
      });

      if (!resp.ok) throw new Error(`Gemini error ${resp.status}`);
      const json = await resp.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? 'AI tidak dapat menjawab soal ini.';
    } catch (err) {
      this.logger.error('Failed to solve image question:', err);
      return 'Gagal memproses gambar soal. Coba lagi atau ketik manual.';
    }
  }
}
