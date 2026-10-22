import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EntryStatus } from '@prisma/client';
import { IsNotBlank } from '../../common/validators';

export class UpdateLogbookEntryDto {
  @IsOptional()
  @IsString()
  @IsNotBlank()
  @MaxLength(2000)
  activity?: string;

  // Mirrors the create DTO's validation so an invalid URL can't slip in
  // through PATCH after being rejected on POST. An empty string is allowed
  // through: the service turns it into null, which is how a student clears
  // the evidence link.
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsUrl()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'REVIEWED', 'FINALIZED'])
  status?: EntryStatus;
}
