import { IsArray, IsString, IsOptional, IsInt, Min, Max, ArrayMinSize } from 'class-validator';

export class GenerateQuizDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Pilih minimal 1 sesi pertemuan.' })
  @IsString({ each: true })
  sessionIds: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  count?: number;
}
