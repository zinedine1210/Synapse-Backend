import { IsString, IsOptional, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PredictionQuestionDto {
  @IsEnum(['ESSAY', 'MULTIPLE_CHOICE'])
  type: 'ESSAY' | 'MULTIPLE_CHOICE';

  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  options?: string; // JSON array string e.g. '["A. ...", "B. ..."]'

  @IsOptional()
  @IsString()
  answerKey?: string;

  @IsOptional()
  @IsString()
  explanation?: string;
}

export class CreatePredictionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  sessionIds: string[];

  @IsString()
  source: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PredictionQuestionDto)
  questions: PredictionQuestionDto[];
}
