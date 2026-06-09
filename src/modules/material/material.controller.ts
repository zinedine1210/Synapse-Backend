import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialService } from './material.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('materials')
@UseGuards(AuthGuard)
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  /**
   * POST /api/v1/materials/upload
   * Upload file materi. Langsung return 202 Accepted, AI berjalan di background.
   */
  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
  ) {
    return this.materialService.uploadMaterial(user, file, sessionId);
  }

  /**
   * GET /api/v1/materials/:id/status
   * Polling endpoint – cek status AI processing dan ambil aiSummary.
   */
  @Get(':id/status')
  getStatus(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.materialService.getMaterialStatus(id, user.id);
  }

  /**
   * DELETE /api/v1/materials/:id
   * Hapus material dan file dari storage.
   */
  @Delete(':id')
  deleteMaterial(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.materialService.deleteMaterial(id, user.id);
  }
}
