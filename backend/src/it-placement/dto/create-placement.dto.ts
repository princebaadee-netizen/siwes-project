import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Guards against the calendar generator running away. A placement is
 * turned into one row per attendance day, so an unbounded range is a
 * trivial way to generate hundreds of thousands of rows and a ~100MB
 * response. Real IT/SIWES placements are months long, not millennia.
 */
export const MIN_PLACEMENT_YEAR = 2000;
export const MAX_PLACEMENT_YEAR = 2100;
export const MAX_PLACEMENT_MONTHS = 24;

export class CreatePlacementDto {
  @IsNotEmpty()
  companyName: string;

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  industrySector?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(VALID_DAYS, { each: true })
  attendancePattern: string[];
}
