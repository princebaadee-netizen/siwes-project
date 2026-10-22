import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const STATUSES = ['DRAFT', 'REVIEWED', 'FINALIZED'] as const;

/** Student edits of a generated section: change the text and/or its status. */
export class UpdateSectionDto {
  // An empty string is allowed so a student can blank a section out and
  // rewrite it — the service stores it as-is, and the UI falls back to the
  // "not written yet" state.
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
