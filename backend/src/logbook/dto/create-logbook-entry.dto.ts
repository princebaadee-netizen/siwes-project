import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { LogbookEntrySource } from '@prisma/client';

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

  // Set by the client to label an entry the "Polish with AI" flow produced.
  // AI_BULK is reserved for the bulk fill-up and cannot be set here.
  @IsOptional()
  @IsIn(['MANUAL', 'AI_SINGLE_DAY'])
  source?: LogbookEntrySource;
}
