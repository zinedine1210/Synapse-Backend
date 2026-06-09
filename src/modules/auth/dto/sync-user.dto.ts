import { IsEmail, IsString, IsOptional, IsUrl } from 'class-validator';

export class SyncUserDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  email: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar URL harus berupa URL yang valid.' })
  avatarUrl?: string;
}
