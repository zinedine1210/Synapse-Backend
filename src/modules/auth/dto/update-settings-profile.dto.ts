import { IsOptional, IsString } from 'class-validator';

export class UpdateSettingsProfileDto {
  @IsOptional()
  @IsString({ message: 'fullName harus berupa string.' })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'avatarUrl harus berupa string.' })
  avatarUrl?: string;
}
