import { IsIn } from 'class-validator';
import { EntryStatus } from '@prisma/client';

export class UpdateChapterStatusDto {
  @IsIn(['DRAFT', 'REVIEWED', 'FINALIZED'])
  status: EntryStatus;
}
