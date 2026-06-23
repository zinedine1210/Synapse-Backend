import { IsString, IsOptional, IsNumber, IsPositive, MaxLength } from 'class-validator';

export class CreateKolektifDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetAmount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetPerPerson?: number;
}

export class SetTargetDto {
  @IsNumber()
  @IsPositive()
  targetPerPerson: number;
}

export class AddTransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  type: 'IN' | 'OUT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}
