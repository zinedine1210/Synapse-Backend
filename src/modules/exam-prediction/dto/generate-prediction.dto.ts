import { IsString, IsOptional, IsArray, IsEnum, IsNumber, Min } from 'class-validator';

export class GeneratePredictionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  sessionIds: string[];

  @IsEnum(['ESSAY', 'MULTIPLE_CHOICE', 'MIXED'])
  type: 'ESSAY' | 'MULTIPLE_CHOICE' | 'MIXED';

  @IsNumber()
  @Min(0)
  countPG: number;

  @IsNumber()
  @Min(0)
  countEssay: number;
}
