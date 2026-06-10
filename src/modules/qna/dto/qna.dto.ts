import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  category?: string[];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class CreateAnswerDto {
  @IsString()
  body: string;
}
