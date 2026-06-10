import { IsString, IsNumber, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class CreateTransactionDto {
  @IsNumber()
  amount: number;

  @IsString()
  type: string; // "income" | "expense"

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  inputMethod?: string;

  @IsOptional()
  @IsString()
  receiptImageUrl?: string;

  @IsOptional()
  @IsString()
  linkedTreeId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
