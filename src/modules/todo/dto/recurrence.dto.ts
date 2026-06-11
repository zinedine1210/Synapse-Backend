import { IsIn, IsOptional } from 'class-validator';

export class SetRecurrenceDto {
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', null])
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
}
