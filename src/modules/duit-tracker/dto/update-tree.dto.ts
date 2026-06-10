import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class UpdateTreeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  targetAmount?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  treeType?: string;
}
