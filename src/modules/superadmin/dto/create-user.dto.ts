import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  email: string;

  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter.' })
  fullName: string;

  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter.' })
  password: string;

  @IsOptional()
  @IsIn(['USER', 'SUPERADMIN'], { message: 'Role harus USER atau SUPERADMIN.' })
  role?: 'USER' | 'SUPERADMIN';
}
