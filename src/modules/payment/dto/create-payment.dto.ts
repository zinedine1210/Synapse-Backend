import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama plan wajib diisi.' })
  plan: string;

  @IsString()
  @IsOptional()
  promoCode?: string;
}
