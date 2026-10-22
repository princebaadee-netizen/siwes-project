import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { IsNotBlank } from '../../common/validators';

export class UpdateHolidayDto {
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString()
  @IsNotBlank()
  name?: string;
}
