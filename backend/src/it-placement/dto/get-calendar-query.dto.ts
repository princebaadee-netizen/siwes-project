import { IsOptional, IsDateString } from 'class-validator';

/**
 * A placement is capped at 24 months and the calendar only holds attendance
 * days, so the full list is at most a few hundred rows. `from`/`to` exist so a
 * client can render one month of the logbook at a time instead of the whole
 * placement, not because the whole list is too big to send.
 */
export class GetCalendarQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
