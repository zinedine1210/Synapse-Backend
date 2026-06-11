import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateBawelSettingDto {
  @IsOptional()
  @IsString()
  level?: string; // "SANTAI" | "NORMAL" | "CEREWET"

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
