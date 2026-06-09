import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePlanConfigDto {
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
}
