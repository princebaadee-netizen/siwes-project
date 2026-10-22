import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateHolidayDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsNotEmpty()
  @IsString()
  name: string;
}
