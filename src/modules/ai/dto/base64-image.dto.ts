import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * DTO untuk endpoint AI yang menerima base64 image.
 * No file size limit — AI endpoints process images without storing them.
 */
export class Base64ImageDto {
  @IsString()
  @IsNotEmpty({ message: 'base64 wajib diisi.' })
  base64: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType wajib diisi.' })
  @Matches(/^image\/(jpeg|jpg|png|gif|webp|bmp)$/, {
    message: 'mimeType harus berupa format gambar yang valid (jpeg, png, gif, webp).',
  })
  mimeType: string;
}
