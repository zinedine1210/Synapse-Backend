import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateTreeDto {
  @IsString()
  name: string;

  @IsNumber()
  targetAmount: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  treeType?: string;
}

export class TreeTransactionDto {
  @IsNumber()
  amount: number;

  @IsString()
  type: string; // "deposit" | "withdrawal"

  @IsOptional()
  @IsString()
  note?: string;
}
