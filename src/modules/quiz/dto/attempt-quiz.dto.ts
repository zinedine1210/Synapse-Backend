import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class AttemptQuizDto {
  @IsString()
  quizId: string;

  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @IsOptional()
  answers?: Record<string, string>;
}
