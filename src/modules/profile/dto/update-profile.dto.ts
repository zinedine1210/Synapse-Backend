import { IsOptional, IsString, IsArray, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  dailyHabits?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  lifeGoals?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  studySchedule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  personalNotes?: string;
}
