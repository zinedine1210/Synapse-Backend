import { IsOptional, IsString, IsNumber, IsArray, IsObject, Min, Max } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  birthDate?: string; // ISO date string

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsNumber()
  enrollmentYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(14)
  currentSemester?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  gpa?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  learningStyle?: string;

  @IsOptional()
  @IsString()
  studyGoals?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  dailyStudyHours?: number;

  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
