import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

/**
 * DTO untuk endpoint AI yang menerima base64 image.
 * Membatasi ukuran base64 agar tidak ada abuse dengan gambar raksasa.
 * Max ~5MB base64 (sekitar 3.75MB file asli)
 */
export class Base64ImageDto {
  @IsString()
  @IsNotEmpty({ message: 'base64 wajib diisi.' })
  @MaxLength(5 * 1024 * 1024, { message: 'Ukuran gambar terlalu besar. Maksimal ~5MB.' })
  base64: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType wajib diisi.' })
  @Matches(/^image\/(jpeg|jpg|png|gif|webp|bmp)$/, {
    message: 'mimeType harus berupa format gambar yang valid (jpeg, png, gif, webp).',
  })
  mimeType: string;
}
