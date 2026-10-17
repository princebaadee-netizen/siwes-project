import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional extra guidance the student can add before a section is generated or
 * regenerated (e.g. "mention the weekend shift I worked").
 */
export class GenerateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
