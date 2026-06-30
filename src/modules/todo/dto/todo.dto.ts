import { IsString, IsOptional, IsDateString, IsArray, IsIn, IsInt } from 'class-validator';

export class CreateTodoDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  dueTime?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  inputMethod?: string;

  // Event/Jadwal fields
  @IsOptional()
  @IsIn(['todo', 'event'])
  type?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(['meeting', 'kuliah', 'ujian', 'penting', 'lainnya'])
  eventType?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  dueTime?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  // Event/Jadwal fields
  @IsOptional()
  @IsIn(['todo', 'event'])
  type?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(['meeting', 'kuliah', 'ujian', 'penting', 'lainnya', null])
  eventType?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];
}
