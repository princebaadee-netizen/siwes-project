import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const STATUSES = ['DRAFT', 'REVIEWED', 'FINALIZED'] as const;

/** Student edits of a generated section: change the text and/or its status. */
export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
