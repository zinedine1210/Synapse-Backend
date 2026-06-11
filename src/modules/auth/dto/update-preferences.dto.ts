import { IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdatePreferencesDto {
  // Notification toggles
  @IsOptional()
  @IsBoolean()
  deadlineReminder?: boolean;

  @IsOptional()
  @IsBoolean()
  budgetAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  streakReminder?: boolean;

  @IsOptional()
  @IsBoolean()
  idleReminder?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyRecap?: boolean;

  @IsOptional()
  @IsBoolean()
  forumReply?: boolean;

  @IsOptional()
  @IsBoolean()
  qnaAnswer?: boolean;

  @IsOptional()
  @IsBoolean()
  achievementAlert?: boolean;

  // Appearance & language
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'system'], { message: 'Theme harus light, dark, atau system.' })
  theme?: string;

  @IsOptional()
  @IsString()
  @IsIn(['id', 'en'], { message: 'Language harus id atau en.' })
  language?: string;
}
