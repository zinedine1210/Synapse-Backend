import { IsString, IsInt, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MaxLength(100)
  name: string;
}

export class AutoGenerateGroupDto {
  @IsInt()
  @Min(1)
  groupCount: number;
}

export class AddMemberDto {
  @IsUUID()
  userId: string;
}
