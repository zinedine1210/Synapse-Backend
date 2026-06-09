import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama plan wajib diisi.' })
  plan: string;
}
