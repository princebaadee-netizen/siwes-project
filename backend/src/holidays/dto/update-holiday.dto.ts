import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateHolidayDto {
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
