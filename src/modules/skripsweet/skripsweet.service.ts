import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  CreateThesisDto, UpdateThesisDto, SetFormatTemplateDto, ExplainFormatDto,
  CreateChapterDto, UpdateChapterDto, AddJournalDto, SearchJournalDto,
  CreateBimbinganDto, UpdateBimbinganDto, ThesisChatDto,
  AddBibliographyEntryDto,
} from './dto/skripsweet.dto';

@Injectable()
export class SkripsweetService {
  private readonly logger = new Logger(SkripsweetService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly aiUsage: AiUsageService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  // ─── Helper: ownership check ──────────────────────────────────────────

  private async getThesisOrFail(userId: string, thesisId: string) {
    const thesis = await this.prisma.thesisProject.findUnique({
      where: { id: thesisId },
      include: {
        formatTemplate: true,
        chapters: { orderBy: { chapterNum: 'asc' } },
        journals: { orderBy: { addedAt: 'desc' } },
        bimbingans: { orderBy: { date: 'desc' } },
        bibliographies: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!thesis || thesis.userId !== userId) {
      throw new NotFoundException('Proyek skripsi tidak ditemukan');
    }
    return thesis;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // THESIS PROJECT CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async createThesis(userId: string, dto: CreateThesisDto) {
    const thesis = await this.prisma.thesisProject.create({
      data: {
        userId,
        title: dto.title,
        university: dto.university,
        faculty: dto.faculty,
        department: dto.department,
        supervisor: dto.supervisor,
        supervisorTwo: dto.supervisorTwo,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        abstract: dto.abstract,
        notes: dto.notes,
      },
      include: { formatTemplate: true, chapters: { orderBy: { chapterNum: 'asc' }, include: { revisions: { orderBy: { createdAt: 'desc' } } } } },
    });
    return thesis;
  }

  async getMyTheses(userId: string) {
    return this.prisma.thesisProject.findMany({
      where: { userId },
      include: {
        formatTemplate: true,
        chapters: { orderBy: { chapterNum: 'asc' }, include: { revisions: { orderBy: { createdAt: 'desc' } } } },
        _count: { select: { journals: true, bimbingans: true, chatMessages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getThesisDetail(userId: string, thesisId: string) {
    return this.getThesisOrFail(userId, thesisId);
  }

  async updateThesis(userId: string, thesisId: string, dto: UpdateThesisDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisProject.update({
      where: { id: thesisId },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
      include: { formatTemplate: true, chapters: { orderBy: { chapterNum: 'asc' }, include: { revisions: { orderBy: { createdAt: 'desc' } } } } },
    });
  }

  async deleteThesis(userId: string, thesisId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisProject.delete({ where: { id: thesisId } });
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FORMAT TEMPLATE — University-specific format flexibility
  // ═══════════════════════════════════════════════════════════════════════

  async setFormatTemplate(userId: string, thesisId: string, dto: SetFormatTemplateDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisFormatTemplate.upsert({
      where: { thesisId },
      create: {
        thesis: { connect: { id: thesisId } },
        universityName: dto.universityName,
        formatRules: dto.formatRules || '{}',
        chapterTemplate: dto.chapterTemplate,
        citationStyle: dto.citationStyle || 'apa7',
        customCitation: dto.customCitation,
        language: dto.language || 'id',
        rawUploadText: dto.rawUploadText,
      },
      update: {
        universityName: dto.universityName,
        formatRules: dto.formatRules,
        chapterTemplate: dto.chapterTemplate,
        citationStyle: dto.citationStyle,
        customCitation: dto.customCitation,
        language: dto.language,
        rawUploadText: dto.rawUploadText,
      },
    });
  }

  /**
   * User explains their thesis format in natural language.
   * AI parses it into structured format rules.
   */
  async explainFormat(userId: string, thesisId: string, dto: ExplainFormatDto) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    await this.getThesisOrFail(userId, thesisId);

    // Strip HTML tags from RichTextEditor output
    const plainText = dto.explanation.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!plainText || plainText.length < 5) {
      return { template: null, error: 'Penjelasan format terlalu pendek. Jelaskan format skripsi kampusmu.' };
    }

    const prompt = `Kamu adalah ahli format skripsi di Indonesia. User menjelaskan format skripsi kampusnya. 
Tugasmu:
1. Parse penjelasan user menjadi JSON format rules yang terstruktur
2. Buat juga default chapter template berdasarkan format tersebut

User menjelaskan:
"""
${plainText}
"""

Balas dalam JSON SAJA (tanpa markdown code block), dengan format:
{
  "formatRules": {
    "margins": { "top": "cm", "bottom": "cm", "left": "cm", "right": "cm" },
    "font": { "name": "", "size": 0 },
    "spacing": "",
    "pageNumbering": "",
    "chapterTitleFormat": "",
    "subChapterFormat": "",
    "citationStyle": "",
    "otherRules": []
  },
  "chapterTemplate": [
    { "chapterNum": 1, "title": "BAB I - ...", "description": "..." },
    ...
  ],
  "citationStyle": "apa7|ieee|chicago|vancouver|custom",
  "language": "id|en"
}`;

    const raw = await this.ai.generateText(prompt);
    
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const template = await this.prisma.thesisFormatTemplate.upsert({
        where: { thesisId },
        create: {
          thesisId,
          formatRules: JSON.stringify(parsed.formatRules),
          chapterTemplate: JSON.stringify(parsed.chapterTemplate),
          citationStyle: parsed.citationStyle || 'apa7',
          language: parsed.language || 'id',
          rawUploadText: dto.explanation,
        },
        update: {
          formatRules: JSON.stringify(parsed.formatRules),
          chapterTemplate: JSON.stringify(parsed.chapterTemplate),
          citationStyle: parsed.citationStyle || 'apa7',
          language: parsed.language || 'id',
          rawUploadText: dto.explanation,
        },
      });

      // Auto-create chapters from template
      if (parsed.chapterTemplate && Array.isArray(parsed.chapterTemplate)) {
        for (const ch of parsed.chapterTemplate) {
          await this.prisma.thesisChapter.upsert({
            where: { thesisId_chapterNum: { thesisId, chapterNum: ch.chapterNum } },
            create: {
              thesisId,
              title: ch.title,
              chapterNum: ch.chapterNum,
              notes: ch.description,
              sortOrder: ch.chapterNum,
            },
            update: {
              title: ch.title,
              notes: ch.description,
            },
          });
        }
      }

      return { template, chapters: parsed.chapterTemplate };
    } catch (e) {
      this.logger.warn('Failed to parse AI format response', e);
      // Save raw text anyway
      const template = await this.prisma.thesisFormatTemplate.upsert({
        where: { thesisId },
        create: { thesisId, formatRules: '{}', rawUploadText: dto.explanation },
        update: { rawUploadText: dto.explanation },
      });
      return { template, rawAiResponse: raw };
    }
  }

  // Upload format file (PDF/DOCX) → extract text → AI parse structure
  async uploadFormatFile(userId: string, thesisId: string, file: Express.Multer.File) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    await this.getThesisOrFail(userId, thesisId);

    if (!file) throw new BadRequestException('File tidak ditemukan');
    
    // Extract text from file
    let extractedText = '';
    if (file.mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(file.buffer);
      extractedText = pdfData.text;
    } else {
      // For DOCX or other text-based files, try direct text extraction
      extractedText = file.buffer.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    if (!extractedText || extractedText.length < 50) {
      throw new BadRequestException('Tidak bisa membaca isi file. Pastikan file mengandung teks (bukan gambar scan).');
    }

    // Truncate to avoid token limits
    const textSample = extractedText.substring(0, 8000);

    // Use the same explainFormat logic but with extracted text
    return this.explainFormat(userId, thesisId, { explanation: `Berikut adalah contoh skripsi dari kampus saya. Tolong analisis strukturnya (bab-bab, format margin, font, spasi, gaya sitasi, dll):\n\n${textSample}` });
  }

  // Upload bimbingan attachment
  async uploadBimbinganAttachment(userId: string, thesisId: string, bimbinganId: string, file: Express.Multer.File) {
    await this.getThesisOrFail(userId, thesisId);
    const bimbingan = await this.prisma.thesisBimbingan.findUnique({ where: { id: bimbinganId } });
    if (!bimbingan || bimbingan.thesisId !== thesisId) throw new NotFoundException('Bimbingan tidak ditemukan');

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `skripsweet/${userId}/${thesisId}/bimbingan/${Date.now()}-${safeName}`;

    const { error } = await this.supabase.storage.from('materials').upload(fileName, file.buffer, { contentType: file.mimetype });
    if (error) throw new BadRequestException('Gagal mengupload file');

    const { data } = this.supabase.storage.from('materials').getPublicUrl(fileName);

    return this.prisma.thesisBimbingan.update({
      where: { id: bimbinganId },
      data: { attachment: data.publicUrl },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHAPTERS
  // ═══════════════════════════════════════════════════════════════════════

  async createChapter(userId: string, thesisId: string, dto: CreateChapterDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisChapter.create({
      data: {
        thesisId,
        title: dto.title,
        chapterNum: dto.chapterNum,
        content: dto.content,
        targetWords: dto.targetWords,
        notes: dto.notes,
        sortOrder: dto.chapterNum,
      },
    });
  }

  async updateChapter(userId: string, thesisId: string, chapterId: string, dto: UpdateChapterDto) {
    await this.getThesisOrFail(userId, thesisId);
    const chapter = await this.prisma.thesisChapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.thesisId !== thesisId) throw new NotFoundException('Bab tidak ditemukan');

    // Count words if content updated (strip HTML tags from Tiptap)
    let wordCount = chapter.wordCount;
    let paragraphCount = (chapter as any).paragraphCount || 0;
    let pageEstimate = (chapter as any).pageEstimate || 0;
    if (dto.content !== undefined) {
      const plainText = dto.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      wordCount = plainText.split(/\s+/).filter(Boolean).length;
      paragraphCount = (dto.content.match(/<\/p>/gi) || []).length || plainText.split(/\n\s*\n/).filter(Boolean).length;
      pageEstimate = Math.round((wordCount / 250) * 10) / 10;

      // Auto-save version if content changed significantly (>50 word diff or first save)
      if (chapter.content && Math.abs(wordCount - chapter.wordCount) >= 50) {
        await this.prisma.chapterVersion.create({
          data: { chapterId, content: chapter.content, wordCount: chapter.wordCount },
        });
        // Keep max 20 versions per chapter
        const versions = await this.prisma.chapterVersion.findMany({
          where: { chapterId }, orderBy: { createdAt: 'desc' }, skip: 20, select: { id: true },
        });
        if (versions.length > 0) {
          await this.prisma.chapterVersion.deleteMany({ where: { id: { in: versions.map(v => v.id) } } });
        }
      }
    }

    return this.prisma.thesisChapter.update({
      where: { id: chapterId },
      data: { ...dto, wordCount, paragraphCount, pageEstimate },
    });
  }

  // ─── Chapter Versions ───────────────────────────────────────
  async getChapterVersions(userId: string, thesisId: string, chapterId: string) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.chapterVersion.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, wordCount: true, label: true, createdAt: true },
    });
  }

  async getChapterVersion(userId: string, thesisId: string, chapterId: string, versionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    const version = await this.prisma.chapterVersion.findUnique({ where: { id: versionId } });
    if (!version || version.chapterId !== chapterId) throw new NotFoundException('Versi tidak ditemukan');
    return version;
  }

  async restoreChapterVersion(userId: string, thesisId: string, chapterId: string, versionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    const chapter = await this.prisma.thesisChapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.thesisId !== thesisId) throw new NotFoundException('Bab tidak ditemukan');
    const version = await this.prisma.chapterVersion.findUnique({ where: { id: versionId } });
    if (!version || version.chapterId !== chapterId) throw new NotFoundException('Versi tidak ditemukan');
    // Save current as version before restoring
    if (chapter.content) {
      await this.prisma.chapterVersion.create({
        data: { chapterId, content: chapter.content, wordCount: chapter.wordCount, label: 'Sebelum restore' },
      });
    }
    return this.prisma.thesisChapter.update({
      where: { id: chapterId },
      data: { content: version.content, wordCount: version.wordCount },
    });
  }

  async saveChapterVersion(userId: string, thesisId: string, chapterId: string, label?: string) {
    await this.getThesisOrFail(userId, thesisId);
    const chapter = await this.prisma.thesisChapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.thesisId !== thesisId) throw new NotFoundException('Bab tidak ditemukan');
    if (!chapter.content) throw new NotFoundException('Bab belum memiliki konten');
    return this.prisma.chapterVersion.create({
      data: { chapterId, content: chapter.content, wordCount: chapter.wordCount, label },
    });
  }

  async deleteChapterVersion(userId: string, thesisId: string, chapterId: string, versionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    const version = await this.prisma.chapterVersion.findUnique({ where: { id: versionId } });
    if (!version || version.chapterId !== chapterId) throw new NotFoundException('Versi tidak ditemukan');
    await this.prisma.chapterVersion.delete({ where: { id: versionId } });
    return { deleted: true };
  }

  async updateChapterVersionLabel(userId: string, thesisId: string, chapterId: string, versionId: string, label: string) {
    await this.getThesisOrFail(userId, thesisId);
    const version = await this.prisma.chapterVersion.findUnique({ where: { id: versionId } });
    if (!version || version.chapterId !== chapterId) throw new NotFoundException('Versi tidak ditemukan');
    return this.prisma.chapterVersion.update({ where: { id: versionId }, data: { label } });
  }

  async deleteChapter(userId: string, thesisId: string, chapterId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisChapter.delete({ where: { id: chapterId } });
    return { deleted: true };
  }

  async reorderChapters(userId: string, thesisId: string, chapterIds: string[]) {
    await this.getThesisOrFail(userId, thesisId);
    const updates = chapterIds.map((id, i) =>
      this.prisma.thesisChapter.update({ where: { id }, data: { sortOrder: i + 1, chapterNum: i + 1 } }),
    );
    await this.prisma.$transaction(updates);
    return { reordered: true };
  }

  // ─── Chapter Revisions ──────────────────────────────────────
  async addRevision(userId: string, thesisId: string, chapterId: string, dto: { note: string; round?: number }) {
    await this.getThesisOrFail(userId, thesisId);
    const chapter = await this.prisma.thesisChapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.thesisId !== thesisId) throw new NotFoundException('Bab tidak ditemukan');
    // Auto-detect round from existing revisions
    const maxRound = await this.prisma.chapterRevision.aggregate({ where: { chapterId }, _max: { round: true } });
    const round = dto.round || (maxRound._max.round || 0) + 1;
    const revision = await this.prisma.chapterRevision.create({
      data: { chapterId, thesisId, note: dto.note, round },
    });
    // Auto-set chapter status to revision
    await this.prisma.thesisChapter.update({ where: { id: chapterId }, data: { status: 'revision' } });
    return revision;
  }

  async resolveRevision(userId: string, thesisId: string, chapterId: string, revisionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    const revision = await this.prisma.chapterRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.chapterId !== chapterId) throw new NotFoundException('Revisi tidak ditemukan');
    const updated = await this.prisma.chapterRevision.update({
      where: { id: revisionId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    // If all revisions resolved, auto-set chapter status to drafting
    const pending = await this.prisma.chapterRevision.count({ where: { chapterId, status: 'pending' } });
    if (pending === 0) {
      await this.prisma.thesisChapter.update({ where: { id: chapterId }, data: { status: 'drafting' } });
    }
    return updated;
  }

  async unresolveRevision(userId: string, thesisId: string, chapterId: string, revisionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    const revision = await this.prisma.chapterRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.chapterId !== chapterId) throw new NotFoundException('Revisi tidak ditemukan');
    const updated = await this.prisma.chapterRevision.update({
      where: { id: revisionId },
      data: { status: 'pending', resolvedAt: null },
    });
    await this.prisma.thesisChapter.update({ where: { id: chapterId }, data: { status: 'revision' } });
    return updated;
  }

  async deleteRevision(userId: string, thesisId: string, chapterId: string, revisionId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.chapterRevision.delete({ where: { id: revisionId } });
    const pending = await this.prisma.chapterRevision.count({ where: { chapterId, status: 'pending' } });
    if (pending === 0) {
      const total = await this.prisma.chapterRevision.count({ where: { chapterId } });
      if (total === 0) {
        // No revisions left, keep current status
      } else {
        await this.prisma.thesisChapter.update({ where: { id: chapterId }, data: { status: 'drafting' } });
      }
    }
    return { deleted: true };
  }

  async getAiChapterFeedback(userId: string, thesisId: string, chapterId: string) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    const thesis = await this.getThesisOrFail(userId, thesisId);
    const chapter = thesis.chapters.find(c => c.id === chapterId);
    if (!chapter) throw new NotFoundException('Bab tidak ditemukan');
    if (!chapter.content || chapter.content.trim().length < 50) {
      return { feedback: 'Konten bab masih terlalu sedikit untuk dianalisis. Tulis minimal 50 karakter dulu ya.' };
    }

    const formatContext = thesis.formatTemplate
      ? `Format skripsi kampus: ${thesis.formatTemplate.formatRules}\nGaya sitasi: ${thesis.formatTemplate.citationStyle}`
      : 'Format skripsi belum diatur.';

    const prompt = `Kamu adalah dosen pembimbing skripsi yang kritis tapi membangun.
Analisis bab skripsi berikut dan berikan feedback yang actionable.

Judul Skripsi: "${thesis.title}"
${formatContext}

Bab: "${chapter.title}"
Jumlah kata: ${chapter.wordCount}
${chapter.targetWords ? `Target kata: ${chapter.targetWords}` : ''}

Konten:
"""
${chapter.content.substring(0, 8000)}
"""

Berikan feedback dalam format markdown:
## 📊 Penilaian Umum
(skor 1-10 dan alasan singkat)

## ✅ Yang Sudah Baik
- ...

## ⚠️ Yang Perlu Diperbaiki
- ...

## 💡 Saran Spesifik
- ...

## 📝 Saran Kalimat/Paragraf
(berikan contoh revisi spesifik jika ada)`;

    const feedback = await this.ai.generateText(prompt);
    
    // Save the feedback
    await this.prisma.thesisChapter.update({
      where: { id: chapterId },
      data: { aiSuggestion: feedback },
    });

    return { feedback };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JOURNALS / LITERATURE
  // ═══════════════════════════════════════════════════════════════════════

  async addJournal(userId: string, thesisId: string, dto: AddJournalDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisJournal.create({
      data: { thesisId, ...dto },
    });
  }

  async updateJournal(userId: string, thesisId: string, journalId: string, dto: Partial<AddJournalDto>) {
    await this.getThesisOrFail(userId, thesisId);
    const journal = await this.prisma.thesisJournal.findUnique({ where: { id: journalId } });
    if (!journal || journal.thesisId !== thesisId) throw new NotFoundException('Jurnal tidak ditemukan');
    return this.prisma.thesisJournal.update({ where: { id: journalId }, data: dto });
  }

  async removeJournal(userId: string, thesisId: string, journalId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisJournal.delete({ where: { id: journalId } });
    return { deleted: true };
  }

  async searchJournals(userId: string, thesisId: string, dto: SearchJournalDto) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    await this.getThesisOrFail(userId, thesisId);
    const limit = dto.limit || 10;

    try {
      // Use Semantic Scholar API for real journal search
      const encoded = encodeURIComponent(dto.query);
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encoded}&limit=${limit}&fields=title,authors,year,abstract,externalIds,journal,url,citationCount`,
      );

      if (!response.ok) {
        this.logger.warn(`Semantic Scholar API error: ${response.status}`);
        // On rate limit (429) or error, fallback to AI
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const results = (data.data || []).map((paper: any) => ({
        title: paper.title,
        authors: paper.authors?.map((a: any) => a.name).join(', ') || '',
        year: paper.year,
        abstract: paper.abstract,
        doi: paper.externalIds?.DOI || null,
        url: paper.url,
        journalName: paper.journal?.name || '',
        citationCount: paper.citationCount || 0,
      }));

      return { results, source: 'semantic_scholar' };
    } catch (e) {
      this.logger.warn('Semantic Scholar search failed, falling back to AI', e);
      
      // Fallback: AI-generated suggestions
      const prompt = `Cari jurnal ilmiah yang relevan dengan topik: "${dto.query}"
Berikan ${limit} jurnal dalam format JSON array:
[{ "title": "", "authors": "", "year": 0, "journalName": "", "abstract": "", "doi": "" }]
Balas JSON saja tanpa markdown code block.`;

      const raw = await this.ai.generateText(prompt);
      try {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const results = JSON.parse(cleaned);
        return { results, source: 'ai_suggestion' };
      } catch {
        return { results: [], source: 'error', rawResponse: raw };
      }
    }
  }

  async getRelevanceMatrix(userId: string, thesisId: string) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    const thesis = await this.getThesisOrFail(userId, thesisId);
    if (thesis.journals.length === 0) {
      return { matrix: [], message: 'Belum ada jurnal yang ditambahkan.' };
    }

    const journalList = thesis.journals.map(j =>
      `- "${j.title}" (${j.authors || 'Unknown'}, ${j.year || 'N/A'}): ${j.relevance || j.abstract || 'No description'}`
    ).join('\n');

    const prompt = `Kamu ahli review literatur. Analisis relevansi jurnal-jurnal ini terhadap skripsi "${thesis.title}".

Jurnal:
${journalList}

Buatkan literature review matrix dalam format JSON:
[{
  "title": "",
  "theme": "",
  "methodology": "",
  "findings": "",
  "relevanceToThesis": "",
  "gap": "",
  "score": 0-10
}]
Balas JSON saja tanpa markdown code block.`;

    const raw = await this.ai.generateText(prompt);
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return { matrix: JSON.parse(cleaned) };
    } catch {
      return { matrix: [], rawResponse: raw };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BIMBINGAN LOG
  // ═══════════════════════════════════════════════════════════════════════

  async createBimbingan(userId: string, thesisId: string, dto: CreateBimbinganDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisBimbingan.create({
      data: {
        thesisId,
        date: new Date(dto.date),
        supervisor: dto.supervisor,
        topic: dto.topic,
        feedback: dto.feedback,
        actionItems: dto.actionItems,
        status: dto.status || 'pending',
      },
    });
  }

  async updateBimbingan(userId: string, thesisId: string, bimbinganId: string, dto: UpdateBimbinganDto) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisBimbingan.update({
      where: { id: bimbinganId },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async deleteBimbingan(userId: string, thesisId: string, bimbinganId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisBimbingan.delete({ where: { id: bimbinganId } });
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONTEXTUAL AI CHAT
  // ═══════════════════════════════════════════════════════════════════════

  async chat(userId: string, thesisId: string, dto: ThesisChatDto) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    const thesis = await this.getThesisOrFail(userId, thesisId);

    // Build context from thesis data
    const formatInfo = thesis.formatTemplate
      ? `Format kampus: ${thesis.formatTemplate.universityName || thesis.university || 'Unknown'}
Gaya sitasi: ${thesis.formatTemplate.citationStyle}
Aturan format: ${thesis.formatTemplate.formatRules}`
      : '';

    const chaptersInfo = thesis.chapters.map(c =>
      `${c.title} (${c.status}, ${c.wordCount} kata)`
    ).join('\n');

    const journalsInfo = thesis.journals.slice(0, 10).map(j =>
      `- "${j.title}" (${j.year || 'N/A'})`
    ).join('\n');

    // Get recent chat history (last 10 messages)
    const history = await this.prisma.thesisChatMessage.findMany({
      where: { thesisId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const historyText = history.reverse().map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`
    ).join('\n');

    const contextChapter = dto.context
      ? thesis.chapters.find(c => c.id === dto.context || c.title.includes(dto.context!))
      : null;

    const prompt = `Kamu adalah asisten skripsi AI yang cerdas dan membantu. Kamu memahami konteks skripsi user secara mendalam.

=== KONTEKS SKRIPSI ===
Judul: "${thesis.title}"
Universitas: ${thesis.university || 'Belum diisi'}
Prodi: ${thesis.department || 'Belum diisi'}
Pembimbing: ${thesis.supervisor || 'Belum diisi'}
Status: ${thesis.status}
${formatInfo}

=== BAB-BAB ===
${chaptersInfo || 'Belum ada bab'}

=== REFERENSI ===
${journalsInfo || 'Belum ada jurnal'}

${contextChapter ? `=== KONTEKS BAB AKTIF ===
Bab: ${contextChapter.title}
Konten (preview): ${(contextChapter.content || '').substring(0, 3000)}` : ''}

=== RIWAYAT CHAT ===
${historyText || 'Belum ada riwayat chat'}

=== PERTANYAAN USER ===
${dto.message}

Jawab dengan bahasa Indonesia yang natural dan akademis. Jika ditanya soal format/penulisan, sesuaikan dengan aturan format kampus user. Gunakan markdown untuk formatting.`;

    const response = await this.ai.generateText(prompt);

    // Save both messages
    await this.prisma.thesisChatMessage.createMany({
      data: [
        { thesisId, role: 'user', content: dto.message, context: dto.context },
        { thesisId, role: 'assistant', content: response, context: dto.context },
      ],
    });

    return { response };
  }

  async getChatHistory(userId: string, thesisId: string, page = 1, limit = 20) {
    await this.getThesisOrFail(userId, thesisId);
    const messages = await this.prisma.thesisChatMessage.findMany({
      where: { thesisId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return messages.reverse();
  }

  async clearChatHistory(userId: string, thesisId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisChatMessage.deleteMany({ where: { thesisId } });
    return { cleared: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI WRITING ASSIST (per chapter)
  // ═══════════════════════════════════════════════════════════════════════

  async aiWriteAssist(userId: string, thesisId: string, chapterId: string, dto: import('./dto/skripsweet.dto').AiWriteAssistDto) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    const thesis = await this.getThesisOrFail(userId, thesisId);
    const chapter = thesis.chapters.find(c => c.id === chapterId);
    if (!chapter) throw new NotFoundException('Chapter not found');

    const formatInfo = thesis.formatTemplate
      ? `Gaya sitasi: ${thesis.formatTemplate.citationStyle}\nAturan format: ${thesis.formatTemplate.formatRules || ''}`
      : '';

    const journalRefs = thesis.journals.slice(0, 8).map(j =>
      `- "${j.title}" (${j.authors || ''}, ${j.year || ''})`
    ).join('\n');

    const plainContent = (chapter.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const lastPart = plainContent.slice(-2000); // Last 2000 chars for context

    const actionPrompts: Record<string, string> = {
      continue: `Lanjutkan penulisan bab ini dari posisi terakhir. Tulis 2-3 paragraf lanjutan yang koheren dan akademis. Jangan ulangi kalimat terakhir.`,
      expand: `Perluas dan kembangkan teks yang dipilih user berikut menjadi lebih detail dan mendalam (2-3 paragraf). Tambahkan penjelasan, contoh, atau elaborasi.

Teks yang dipilih: "${dto.selectedText || ''}"`,
      rewrite: `Tulis ulang teks berikut agar lebih akademis, jelas, dan terstruktur. Pertahankan makna utama tapi perbaiki gaya bahasa.

Teks yang dipilih: "${dto.selectedText || ''}"`,
      outline: `Buatkan kerangka (outline) detail untuk bab ini. Buat dalam format daftar bernomor dengan sub-poin. Sesuaikan dengan judul bab dan konteks skripsi.`,
      opening: `Buatkan paragraf pembuka yang kuat untuk bab ini. Paragraf harus memperkenalkan topik bab, memberikan konteks, dan mengarahkan pembaca.`,
      transition: `Buatkan paragraf transisi untuk menghubungkan bagian yang sudah ditulis dengan bagian selanjutnya. Harus smooth dan logical.`,
      conclusion: `Buatkan paragraf penutup/kesimpulan untuk bab ini berdasarkan konten yang sudah ditulis. Rangkum poin-poin utama.`,
      custom: dto.customPrompt || 'Bantu saya menulis bagian ini.',
    };

    const actionInstruction = actionPrompts[dto.action] || actionPrompts.custom;

    const prompt = `Kamu adalah asisten penulisan skripsi akademis yang sangat baik. Kamu membantu mahasiswa menulis bab skripsi.

=== KONTEKS SKRIPSI ===
Judul: "${thesis.title}"
Universitas: ${thesis.university || '-'}
Prodi: ${thesis.department || '-'}
${formatInfo}

=== BAB YANG DIKERJAKAN ===
Judul Bab: ${chapter.title}
Status: ${chapter.status}
Jumlah kata saat ini: ${chapter.wordCount}
${chapter.targetWords ? `Target kata: ${chapter.targetWords}` : ''}

=== KONTEN TERAKHIR BAB INI ===
${lastPart || '(Belum ada konten)'}

=== REFERENSI TERSEDIA ===
${journalRefs || '(Belum ada referensi)'}

=== INSTRUKSI ===
${actionInstruction}

ATURAN PENTING:
- Tulis dalam bahasa Indonesia yang akademis dan formal
- Gunakan format HTML sederhana (paragraf <p>, bold <strong>, italic <em>, list <ul><li>)
- JANGAN gunakan markdown, gunakan HTML
- Sesuaikan dengan gaya penulisan skripsi Indonesia
- Jika ada referensi yang relevan, sebutkan (Penulis, Tahun)
- Output HANYA konten yang diminta, tanpa pengantar atau penjelasan tambahan`;

    const result = await this.ai.generateText(prompt);

    return { content: result, action: dto.action };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BIBLIOGRAPHY / DAFTAR PUSTAKA
  // ═══════════════════════════════════════════════════════════════════════

  async generateBibliography(userId: string, thesisId: string, style?: string) {
    await this.aiUsage.checkAndRecord(userId, 'skripsweet');
    const thesis = await this.getThesisOrFail(userId, thesisId);
    if (thesis.journals.length === 0) {
      return { bibliography: [], message: 'Belum ada jurnal. Tambahkan jurnal dulu ya!' };
    }

    const citationStyle = style || thesis.formatTemplate?.citationStyle || 'apa7';
    const customRules = thesis.formatTemplate?.customCitation || '';

    const journalData = thesis.journals.map(j => ({
      title: j.title,
      authors: j.authors,
      year: j.year,
      journalName: j.journalName,
      doi: j.doi,
      url: j.url,
      bibtex: j.bibtex,
      citationKey: j.citationKey,
    }));

    const prompt = `Kamu ahli daftar pustaka/bibliography. Generate daftar pustaka dari data jurnal berikut.

Gaya sitasi: ${citationStyle}
${customRules ? `Aturan khusus: ${customRules}` : ''}

Data jurnal:
${JSON.stringify(journalData, null, 2)}

Buatkan output dalam format JSON array:
[{
  "citationKey": "Smith2024",
  "entry": "formatted bibliography entry string",
  "entryType": "article|book|inproceedings|thesis|website"
}]
Urutkan alphabetically sesuai standar ${citationStyle}.
Balas JSON saja tanpa markdown code block.`;

    const raw = await this.ai.generateText(prompt);
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const entries = JSON.parse(cleaned);

      // Save bibliography entries
      await this.prisma.thesisBibliography.deleteMany({ where: { thesisId } });
      for (let i = 0; i < entries.length; i++) {
        await this.prisma.thesisBibliography.create({
          data: {
            thesisId,
            journalId: thesis.journals.find(j => j.citationKey === entries[i].citationKey)?.id,
            rawEntry: entries[i].entry,
            citationKey: entries[i].citationKey,
            entryType: entries[i].entryType || 'article',
            sortOrder: i,
          },
        });
      }

      return { bibliography: entries, style: citationStyle };
    } catch {
      return { bibliography: [], rawResponse: raw };
    }
  }

  async addBibliographyEntry(userId: string, thesisId: string, dto: AddBibliographyEntryDto) {
    await this.getThesisOrFail(userId, thesisId);
    const maxOrder = await this.prisma.thesisBibliography.findFirst({
      where: { thesisId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.thesisBibliography.create({
      data: {
        thesisId,
        journalId: dto.journalId,
        rawEntry: dto.rawEntry,
        citationKey: dto.citationKey,
        entryType: dto.entryType || 'article',
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });
  }

  async deleteBibliographyEntry(userId: string, thesisId: string, entryId: string) {
    await this.getThesisOrFail(userId, thesisId);
    await this.prisma.thesisBibliography.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROGRESS & STATS
  // ═══════════════════════════════════════════════════════════════════════

  async getProgress(userId: string, thesisId: string) {
    const thesis = await this.getThesisOrFail(userId, thesisId);

    const totalChapters = thesis.chapters.length;
    const doneChapters = thesis.chapters.filter(c => c.status === 'done').length;
    const totalWords = thesis.chapters.reduce((sum, c) => sum + c.wordCount, 0);
    const targetWords = thesis.chapters.reduce((sum, c) => sum + (c.targetWords || 0), 0);

    const totalBimbingan = thesis.bimbingans.length;
    const doneBimbingan = thesis.bimbingans.filter(b => b.status === 'done').length;
    const pendingActions = thesis.bimbingans
      .filter(b => b.status === 'pending' && b.actionItems)
      .flatMap(b => {
        try { return JSON.parse(b.actionItems!); } catch { return []; }
      });

    const totalJournals = thesis.journals.length;

    const chapterProgress = thesis.chapters.map(c => ({
      id: c.id,
      title: c.title,
      chapterNum: c.chapterNum,
      status: c.status,
      wordCount: c.wordCount,
      targetWords: c.targetWords,
      progress: c.targetWords ? Math.min(Math.round((c.wordCount / c.targetWords) * 100), 100) : 0,
    }));

    const overallProgress = totalChapters > 0
      ? Math.round((doneChapters / totalChapters) * 100)
      : 0;

    return {
      overallProgress,
      totalChapters,
      doneChapters,
      totalWords,
      targetWords,
      totalBimbingan,
      doneBimbingan,
      pendingActions,
      totalJournals,
      chapterProgress,
      daysElapsed: thesis.startDate ? Math.floor((Date.now() - thesis.startDate.getTime()) / 86400000) : 0,
      daysRemaining: thesis.targetDate ? Math.max(0, Math.floor((thesis.targetDate.getTime() - Date.now()) / 86400000)) : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOCIAL / COMMUNITY — Explore, Publish, Like, Bookmark, Comment
  // ═══════════════════════════════════════════════════════════════════════

  async publishThesis(userId: string, thesisId: string, tags: string[]) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisProject.update({
      where: { id: thesisId },
      data: { isPublished: true, publishedAt: new Date(), tags },
    });
  }

  async unpublishThesis(userId: string, thesisId: string) {
    await this.getThesisOrFail(userId, thesisId);
    return this.prisma.thesisProject.update({
      where: { id: thesisId },
      data: { isPublished: false, publishedAt: null },
    });
  }

  async explore(userId: string, query?: string, tag?: string, university?: string, page = 1, limit = 12) {
    const where: any = { isPublished: true };
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { abstract: { contains: query, mode: 'insensitive' } },
        { department: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (tag) where.tags = { has: tag };
    if (university) where.university = { contains: university, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.thesisProject.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true, bookmarks: true, journals: true, chapters: true } },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.thesisProject.count({ where }),
    ]);

    // Check if current user liked/bookmarked
    const userLikes = await this.prisma.thesisLike.findMany({
      where: { userId, thesisId: { in: items.map(i => i.id) } },
      select: { thesisId: true },
    });
    const userBookmarks = await this.prisma.thesisBookmark.findMany({
      where: { userId, thesisId: { in: items.map(i => i.id) } },
      select: { thesisId: true },
    });
    const likedSet = new Set(userLikes.map(l => l.thesisId));
    const bookmarkedSet = new Set(userBookmarks.map(b => b.thesisId));

    return {
      items: items.map(item => ({
        ...item,
        isLiked: likedSet.has(item.id),
        isBookmarked: bookmarkedSet.has(item.id),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublicThesis(userId: string, thesisId: string) {
    const thesis = await this.prisma.thesisProject.findUnique({
      where: { id: thesisId },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        chapters: { orderBy: { chapterNum: 'asc' }, select: { id: true, title: true, chapterNum: true, status: true, wordCount: true } },
        journals: { orderBy: { addedAt: 'desc' } },
        bibliographies: { orderBy: { sortOrder: 'asc' } },
        formatTemplate: { select: { citationStyle: true, language: true, universityName: true } },
        _count: { select: { likes: true, comments: true, bookmarks: true } },
        comments: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!thesis || (!thesis.isPublished && thesis.userId !== userId)) {
      throw new NotFoundException('Skripsi tidak ditemukan atau belum dipublikasikan');
    }

    // Increment view
    await this.prisma.thesisProject.update({ where: { id: thesisId }, data: { viewCount: { increment: 1 } } });

    const [like, bookmark] = await Promise.all([
      this.prisma.thesisLike.findUnique({ where: { userId_thesisId: { userId, thesisId } } }),
      this.prisma.thesisBookmark.findUnique({ where: { userId_thesisId: { userId, thesisId } } }),
    ]);

    return { ...thesis, isLiked: !!like, isBookmarked: !!bookmark };
  }

  async toggleLike(userId: string, thesisId: string) {
    const existing = await this.prisma.thesisLike.findUnique({
      where: { userId_thesisId: { userId, thesisId } },
    });
    if (existing) {
      await this.prisma.thesisLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await this.prisma.thesisLike.create({ data: { userId, thesisId } });
    return { liked: true };
  }

  async toggleBookmark(userId: string, thesisId: string) {
    const existing = await this.prisma.thesisBookmark.findUnique({
      where: { userId_thesisId: { userId, thesisId } },
    });
    if (existing) {
      await this.prisma.thesisBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await this.prisma.thesisBookmark.create({ data: { userId, thesisId } });
    return { bookmarked: true };
  }

  async addComment(userId: string, thesisId: string, content: string) {
    return this.prisma.thesisComment.create({
      data: { userId, thesisId, content },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.thesisComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) throw new NotFoundException('Komentar tidak ditemukan');
    await this.prisma.thesisComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }

  async getMyBookmarks(userId: string) {
    const bookmarks = await this.prisma.thesisBookmark.findMany({
      where: { userId },
      include: {
        thesis: {
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            _count: { select: { likes: true, comments: true, journals: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookmarks.map(b => b.thesis);
  }

  async getTrendingTags() {
    const theses = await this.prisma.thesisProject.findMany({
      where: { isPublished: true },
      select: { tags: true },
    });
    const tagCount: Record<string, number> = {};
    for (const t of theses) {
      for (const tag of t.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT / DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════

  async exportThesis(userId: string, thesisId: string) {
    const thesis = await this.getThesisOrFail(userId, thesisId);

    // Build document structure as HTML for conversion
    const chapters = thesis.chapters || [];
    const formatTemplate = thesis.formatTemplate;
    const format = formatTemplate ? JSON.parse(formatTemplate.formatRules || '{}') : {};
    
    // Build HTML document
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${thesis.title}</title><style>
      body { font-family: '${format.font?.name || 'Times New Roman'}', serif; font-size: ${format.font?.size || 12}pt; line-height: ${format.spacing || '1.5'}; margin: 0; padding: 40px; color: #000; }
      h1 { text-align: center; font-size: 14pt; font-weight: bold; margin-top: 40px; margin-bottom: 20px; }
      h2 { font-size: 12pt; font-weight: bold; margin-top: 24px; }
      p { text-align: justify; text-indent: 1.27cm; margin: 0 0 12px; }
      .title-page { text-align: center; page-break-after: always; padding-top: 100px; }
      .title-page h1 { font-size: 16pt; text-transform: uppercase; }
      .chapter { page-break-before: always; }
      .bibliography { page-break-before: always; }
      .bib-entry { text-indent: -1.27cm; padding-left: 1.27cm; margin-bottom: 8px; }
      @page { margin: ${format.margins?.top || '3'}cm ${format.margins?.right || '3'}cm ${format.margins?.bottom || '3'}cm ${format.margins?.left || '4'}cm; size: A4; }
      @media print {
        body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .chapter { page-break-before: always; }
        .title-page { page-break-after: always; }
      }
    </style></head><body>`;

    // Title page
    html += `<div class="title-page">
      <h1>${thesis.title}</h1>
      <p style="text-indent:0;margin-top:40px;">SKRIPSI</p>
      ${thesis.abstract ? `<div style="text-align:justify;margin-top:40px;text-indent:0;"><strong>Abstrak:</strong><br/>${thesis.abstract}</div>` : ''}
      <p style="text-indent:0;margin-top:60px;">Oleh:</p>
      ${thesis.university ? `<p style="text-indent:0;">${thesis.university}</p>` : ''}
      ${thesis.department ? `<p style="text-indent:0;">${thesis.department}</p>` : ''}
    </div>`;

    // Chapters
    for (const ch of chapters) {
      html += `<div class="chapter"><h1>${ch.title}</h1>${ch.content || '<p><em>(Belum ada konten)</em></p>'}</div>`;
    }

    // Bibliography
    if (thesis.bibliographies && thesis.bibliographies.length > 0) {
      html += `<div class="bibliography"><h1>DAFTAR PUSTAKA</h1>`;
      for (const bib of thesis.bibliographies) {
        html += `<div class="bib-entry">${bib.rawEntry || ''}</div>`;
      }
      html += '</div>';
    }

    html += '</body></html>';

    return {
      html,
      filename: `${thesis.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.html`,
      title: thesis.title,
      chapterCount: chapters.length,
      totalWords: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    };
  }
}
