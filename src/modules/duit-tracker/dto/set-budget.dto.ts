import { IsString, IsNumber, IsInt, Min, Max } from 'class-validator';

export class SetBudgetDto {
  @IsString()
  category: string;

  @IsNumber()
  amount: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsInt()
  year: number;
}
