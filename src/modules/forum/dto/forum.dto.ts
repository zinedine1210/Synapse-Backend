import { IsString, IsOptional, IsEnum, MaxLength, MinLength, IsArray, IsBoolean, IsDateString, ArrayMinSize } from 'class-validator';

export enum ForumCategoryDto {
  DISCUSSION = 'DISCUSSION',
  QUESTION = 'QUESTION',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  POLL = 'POLL',
  REMINDER = 'REMINDER',
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Judul maksimal 200 karakter.' })
  title?: string;

  @IsString()
  @MinLength(1, { message: 'Konten tidak boleh kosong.' })
  @MaxLength(5000, { message: 'Konten maksimal 5000 karakter.' })
  content: string;

  @IsOptional()
  @IsEnum(ForumCategoryDto)
  category?: ForumCategoryDto;

  @IsOptional()
  @IsString()
  discussionId?: string;

  // Poll fields (when category = POLL)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'Minimal 2 opsi voting.' })
  @IsString({ each: true })
  pollOptions?: string[];

  @IsOptional()
  @IsBoolean()
  pollMultiple?: boolean;

  // Reminder field (when category = REMINDER)
  @IsOptional()
  @IsDateString()
  remindAt?: string;
}

export class CreateReplyDto {
  @IsString()
  @MinLength(1, { message: 'Balasan tidak boleh kosong.' })
  @MaxLength(3000, { message: 'Balasan maksimal 3000 karakter.' })
  content: string;
}

export class VoteDto {
  @IsString()
  @IsOptional()
  postId?: string;

  @IsString()
  @IsOptional()
  replyId?: string;
}

export class CreateDiscussionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100, { message: 'Judul maksimal 100 karakter.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  assignType?: string; // ALL, INDIVIDUAL, GROUP

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsString()
  assignedGroupId?: string;
}

export class UpdateDiscussionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  assignType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsString()
  assignedGroupId?: string;
}
