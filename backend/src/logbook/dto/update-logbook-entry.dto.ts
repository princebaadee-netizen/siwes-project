import { IsIn, IsOptional, IsString } from 'class-validator';
import { EntryStatus } from '@prisma/client';

export class UpdateLogbookEntryDto {
  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'REVIEWED', 'FINALIZED'])
  status?: EntryStatus;
}
