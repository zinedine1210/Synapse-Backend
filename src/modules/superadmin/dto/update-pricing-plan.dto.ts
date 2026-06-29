import { IsString, IsOptional, IsInt, Min, IsNumber, IsArray } from 'class-validator';

export class UpdatePricingPlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUploadPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxFileSizeMb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiRequestLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiBriefingLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiWeeklyRoastLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiFoodLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationDays?: number;
}
