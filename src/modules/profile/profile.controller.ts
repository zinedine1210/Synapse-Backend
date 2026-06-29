import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profile.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { FileSizeGuard } from '../../common/guards/file-size.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('user/profile')
@UseGuards(AuthGuard, FileSizeGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /api/v1/user/profile
   * Returns user profile + onboarding data.
   */
  @Get()
  getProfile(@GetUser() user: User) {
    return this.profileService.getProfile(user.id);
  }

  /**
   * PATCH /api/v1/user/profile
   * Updates profile fields (onboarding data + AI context fields).
   */
  @Patch()
  updateProfile(@GetUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.id, dto);
  }

  /**
   * POST /api/v1/user/profile/avatar
   * Upload profile photo to Supabase Storage (max 2MB, JPG/PNG/WebP).
   */
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB hard limit at multer level
      fileFilter: (_req, file, callback) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimes.includes(file.mimetype)) {
          return callback(
            new BadRequestException('Format file tidak didukung'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  uploadAvatar(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Multer throws a generic error for file size limit.
    // The service layer also validates, but this catches at multer level.
    return this.profileService.uploadAvatar(user.id, file);
  }

  /**
   * DELETE /api/v1/user/profile/avatar
   * Remove profile photo.
   */
  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  deleteAvatar(@GetUser() user: User) {
    return this.profileService.deleteAvatar(user.id);
  }
}
