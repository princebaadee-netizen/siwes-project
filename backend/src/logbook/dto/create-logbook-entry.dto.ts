import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LogbookEntrySource } from '@prisma/client';
import { IsNotBlank } from '../../common/validators';

export class CreateLogbookEntryDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotBlank()
  @MaxLength(2000)
  activity: string;

  // An empty string is allowed through and stored as null, so a cleared
  // field never blocks the save.
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsUrl()
  @MaxLength(500)
  evidenceUrl?: string;

  // Set by the client to label an entry the "Polish with AI" flow produced.
  // AI_BULK is reserved for the bulk fill-up and cannot be set here.
  @IsOptional()
  @IsIn(['MANUAL', 'AI_SINGLE_DAY'])
  source?: LogbookEntrySource;
}
