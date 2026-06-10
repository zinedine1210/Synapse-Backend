import { IsString, IsOptional, IsInt, MaxLength, Min } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class UpdateSessionDto {
  @IsString()
  @MaxLength(200)
  title: string;
}

export class ReorderSessionDto {
  @IsInt()
  @Min(0)
  newSequence: number;
}
