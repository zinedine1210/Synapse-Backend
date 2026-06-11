import { IsString, IsNotEmpty } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Konfirmasi password diperlukan.' })
  confirmationText: string;
}
