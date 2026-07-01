import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiUsageService } from '../../common/services/ai-usage.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { AiRateLimitGuard } from '../../common/guards/ai-rate-limit.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { Base64ImageDto } from './dto/base64-image.dto';

@Controller('ai')
@UseGuards(AuthGuard, FeatureGuard, AiRateLimitGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiUsage: AiUsageService,
  ) {}

  /**
   * POST /api/v1/ai/parse-schedule
   * Upload gambar jadwal kuliah untuk diurai oleh AI Gemini.
   */
  @Post('parse-schedule')
  @RequireFeature('schedule_parser')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseInterceptors(FileInterceptor('file'))
  async parseSchedule(@UploadedFile() file: Express.Multer.File, @GetUser() user: User) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');
    return this.aiService.parseSchedule(file);
  }

  /**
   * POST /api/v1/ai/ocr
   * OCR gambar apa saja
   */
  @Post('ocr')
  @RequireFeature('ai_digitalization')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async ocr(@Body() body: Base64ImageDto, @GetUser() user: User) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');
    return { text: await this.aiService.ocrImage(body.base64, body.mimeType) };
  }

  /**
   * POST /api/v1/ai/krs
   * Ekstrak mata kuliah dari gambar KRS
   */
  @Post('krs')
  @RequireFeature('ai_digitalization')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async extractKRS(@Body() body: Base64ImageDto, @GetUser() user: User) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');
    return this.aiService.extractClassFromKRSImage(body.base64, body.mimeType);
  }

  /**
   * POST /api/v1/ai/parse-schedule-base64
   * Urai jadwal kuliah dari base64
   */
  @Post('parse-schedule-base64')
  @RequireFeature('schedule_parser')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async parseScheduleBase64(@Body() body: Base64ImageDto, @GetUser() user: User) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');
    return this.aiService.parseScheduleBase64(body.base64, body.mimeType);
  }

  /**
   * POST /api/v1/ai/extract-questions
   * Ekstrak nomor soal dari gambar
   */
  @Post('extract-questions')
  @RequireFeature('ai_digitalization')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async extractQuestions(@Body() body: Base64ImageDto, @GetUser() user: User) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');
    return { questions: await this.aiService.extractQuestionsFromImage(body.base64, body.mimeType) };
  }

  /**
   * POST /api/v1/ai/editor-assist
   * Inline AI assist for rich text editor — general purpose text generation/editing
   */
  @Post('editor-assist')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async editorAssist(
    @Body() body: { prompt: string; context?: string; action?: string },
    @GetUser() user: User,
  ) {
    await this.aiUsage.checkAndRecord(user.id, 'ai_digitalization');

    const actionPrompts: Record<string, string> = {
      explain: 'Jelaskan teks berikut dengan bahasa yang mudah dipahami mahasiswa Indonesia:\n\n',
      summarize: 'Buat ringkasan singkat dan padat dari teks berikut dalam bahasa Indonesia:\n\n',
      improve: 'Perbaiki dan tingkatkan kualitas tulisan berikut (tata bahasa, kejelasan, struktur) dalam bahasa Indonesia. Kembalikan HANYA teks yang sudah diperbaiki, tanpa penjelasan tambahan:\n\n',
      continue: 'Lanjutkan tulisan berikut secara natural dalam bahasa Indonesia, pertahankan gaya dan konteks yang sama:\n\n',
      translate_en: 'Terjemahkan teks berikut ke bahasa Inggris. Kembalikan HANYA hasil terjemahan:\n\n',
      translate_id: 'Terjemahkan teks berikut ke bahasa Indonesia. Kembalikan HANYA hasil terjemahan:\n\n',
    };

    let finalPrompt: string;
    if (body.action && actionPrompts[body.action]) {
      finalPrompt = actionPrompts[body.action] + (body.context || body.prompt);
    } else {
      finalPrompt = body.context
        ? `Konteks tulisan user:\n"""${body.context}"""\n\nPermintaan user: ${body.prompt}\n\nBerikan jawaban yang bisa langsung dimasukkan ke editor. Gunakan format HTML sederhana (p, ul, ol, strong, em, h2, h3, blockquote, code) jika perlu. Jangan beri penjelasan meta, langsung jawab.`
        : `${body.prompt}\n\nBerikan jawaban yang bisa langsung dimasukkan ke editor. Gunakan format HTML sederhana (p, ul, ol, strong, em, h2, h3, blockquote, code) jika perlu. Jangan beri penjelasan meta, langsung jawab.`;
    }

    const result = await this.aiService.generateText(finalPrompt);
    return { content: result };
  }
}
