import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsNumber, IsArray } from 'class-validator';

export class CreatePricingPlanDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama plan wajib diisi.' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  maxUploadPerMonth: number;

  @IsInt()
  @Min(1)
  maxFileSizeMb: number;

  @IsInt()
  @Min(0)
  aiRequestLimit: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  aiBriefingLimit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  aiWeeklyRoastLimit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  aiFoodLimit?: number;

  @IsArray()
  @IsString({ each: true })
  features: string[];

  @IsNumber()
  @Min(0)
  price: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  durationDays?: number;
}
