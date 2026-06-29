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
import { FileSizeGuard } from '../../common/guards/file-size.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { Base64ImageDto } from './dto/base64-image.dto';

@Controller('ai')
@UseGuards(AuthGuard, FeatureGuard, AiRateLimitGuard, FileSizeGuard)
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
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
}
