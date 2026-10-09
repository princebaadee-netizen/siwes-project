import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateLogbookEntryDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  activity: string;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;
}
