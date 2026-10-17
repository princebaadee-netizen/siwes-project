import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Editable cover/title-page fields plus the names to weave into the dedication
 * and acknowledgment. Every field is optional so the client can save one at a
 * time (the guided Q&A fills them in as the student answers).
 */
export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institutionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  institutionAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  faculty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  programme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  matricNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  schoolSupervisor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companySupervisor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  durationLabel?: string;

  @IsOptional()
  @IsDateString()
  submissionDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  dedicationNames?: string[];
}
