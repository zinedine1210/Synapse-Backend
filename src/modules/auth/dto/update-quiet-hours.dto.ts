import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateQuietHoursDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursStart harus format HH:mm (00:00 - 23:59).',
  })
  quietHoursStart?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursEnd harus format HH:mm (00:00 - 23:59).',
  })
  quietHoursEnd?: string | null;
}
