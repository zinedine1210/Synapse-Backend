import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsString()
  @MinLength(3, { message: 'Nama kelas minimal 3 karakter.' })
  @MaxLength(100, { message: 'Nama kelas maksimal 100 karakter.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Deskripsi maksimal 500 karakter.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Nama dosen maksimal 100 karakter.' })
  lecturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Hari kuliah maksimal 20 karakter.' })
  day?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Jam kuliah maksimal 30 karakter.' })
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Ruangan maksimal 100 karakter.' })
  room?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Password maksimal 100 karakter.' })
  password?: string;
}
