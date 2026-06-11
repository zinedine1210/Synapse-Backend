import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  title: string;
}

export class UpdateSubtaskDto {
  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsString()
  title?: string;
}
