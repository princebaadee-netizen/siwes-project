import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreatePlacementDto,
  MAX_PLACEMENT_MONTHS,
  MAX_PLACEMENT_YEAR,
  MIN_PLACEMENT_YEAR,
} from './dto/create-placement.dto';

const WEEKDAY_INDEX_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MONTHS_IN_MS = 30.44 * 24 * 60 * 60 * 1000;

@Injectable()
export class ItPlacementService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlacementDto) {
    if (dto.attendancePattern.length !== dto.daysPerWeek) {
      throw new BadRequestException(
        `attendancePattern must contain exactly ${dto.daysPerWeek} day(s) to match daysPerWeek`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('startDate and endDate must be valid dates');
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    this.assertReasonableRange(startDate, endDate);

    const placement = await this.prisma.iTPlacement.upsert({
      where: { userId },
      update: {
        companyName: dto.companyName,
        companyAddress: dto.companyAddress,
        industrySector: dto.industrySector,
        startDate,
        endDate,
        daysPerWeek: dto.daysPerWeek,
        attendancePattern: dto.attendancePattern,
      },
      create: {
        userId,
        companyName: dto.companyName,
        companyAddress: dto.companyAddress,
        industrySector: dto.industrySector,
        startDate,
        endDate,
        daysPerWeek: dto.daysPerWeek,
        attendancePattern: dto.attendancePattern,
      },
    });

    await this.generateAttendanceCalendar(placement.id, startDate, endDate, dto.attendancePattern);

    return this.getSummary(userId);
  }

  /**
   * The calendar generator turns a placement into one row per attendance day,
   * so an unbounded date range is a trivial way to produce hundreds of
   * thousands of rows and a ~100MB response. Reject implausible ranges up
   * front rather than generating them and failing later.
   */
  private assertReasonableRange(startDate: Date, endDate: Date) {
    const startYear = startDate.getUTCFullYear();
    const endYear = endDate.getUTCFullYear();

    if (startYear < MIN_PLACEMENT_YEAR || endYear < MIN_PLACEMENT_YEAR) {
      throw new BadRequestException(
        `startDate year must be ${MIN_PLACEMENT_YEAR} or later (received ${startYear}). ` +
          'Check the year in the date field — a mistyped year would otherwise generate an enormous calendar.',
      );
    }
    if (startYear > MAX_PLACEMENT_YEAR || endYear > MAX_PLACEMENT_YEAR) {
      throw new BadRequestException(
        `endDate year must be ${MAX_PLACEMENT_YEAR} or earlier (received ${endYear})`,
      );
    }

    const months = (endDate.getTime() - startDate.getTime()) / MONTHS_IN_MS;
    if (months > MAX_PLACEMENT_MONTHS) {
      throw new BadRequestException(
        `A placement cannot run longer than ${MAX_PLACEMENT_MONTHS} months (received approximately ` +
          `${Math.round(months)} months).`,
      );
    }
  }

  /**
   * Scans the full placement duration, keeps only the days matching the
   * attendance pattern, and cross-references each against the federal
   * public holiday list — holiday days are flagged for the student to
   * confirm rather than assumed either way.
   */
  private async generateAttendanceCalendar(
    placementId: string,
    startDate: Date,
    endDate: Date,
    attendancePattern: string[],
  ) {
    // Clear any previously generated days for this placement before regenerating
    // (e.g. if the student edits their dates or pattern after initial setup).
    await this.prisma.attendanceCalendarDay.deleteMany({ where: { placementId } });

    const holidays = await this.prisma.publicHoliday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    });
    const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h]));

    const rows: {
      placementId: string;
      date: Date;
      isAttendanceDay: boolean;
      isPublicHoliday: boolean;
      holidayName: string | null;
      confirmedAttended: boolean | null;
    }[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const weekdayKey = WEEKDAY_INDEX_TO_KEY[d.getDay()];
      if (!attendancePattern.includes(weekdayKey)) continue;

      const dateKey = d.toISOString().slice(0, 10);
      const holiday = holidayByDate.get(dateKey);

      rows.push({
        placementId,
        date: new Date(d),
        isAttendanceDay: true,
        isPublicHoliday: !!holiday,
        holidayName: holiday?.name ?? null,
        // Holiday days wait for the student's yes/no confirmation;
        // ordinary attendance days are assumed attended by default.
        confirmedAttended: holiday ? null : true,
      });
    }

    if (rows.length > 0) {
      await this.prisma.attendanceCalendarDay.createMany({ data: rows });
    }
  }

  /**
   * Returns the placement plus aggregate calendar counts instead of the full
   * day list. Embedding every day makes the response scale with the placement
   * length, which is how a mistyped year once produced a ~100MB payload.
   */
  async getSummary(userId: string) {
    const placement = await this.prisma.iTPlacement.findUnique({ where: { userId } });
    // Returning bare null here would make Nest emit a 200 with an empty body,
    // which is indistinguishable from a broken response and breaks any client
    // that parses the body directly. 404 with a message is the honest signal.
    if (!placement) {
      throw new NotFoundException('No placement has been set up yet. Complete the setup wizard to create one.');
    }

    const [totalDays, holidayDays, awaitingAnswer, loggedEntries] = await Promise.all([
      this.prisma.attendanceCalendarDay.count({ where: { placementId: placement.id } }),
      this.prisma.attendanceCalendarDay.count({
        where: { placementId: placement.id, isPublicHoliday: true },
      }),
      this.prisma.attendanceCalendarDay.count({
        where: { placementId: placement.id, confirmedAttended: null },
      }),
      this.prisma.attendanceCalendarDay.count({
        where: { placementId: placement.id, hasLogbookEntry: true },
      }),
    ]);

    return {
      ...placement,
      calendarSummary: { totalDays, holidayDays, awaitingAnswer, loggedEntries },
    };
  }

  /**
   * The day list behind the summary counts. Only the fields a day picker and a
   * logbook row actually need are selected - the raw Date objects are mapped to
   * plain ISO strings so the response is cacheable and stable across timezones.
   */
  async getCalendar(userId: string, from?: string, to?: string) {
    const placement = await this.prisma.iTPlacement.findUnique({ where: { userId } });
    if (!placement) {
      throw new NotFoundException('No placement has been set up yet. Complete the setup wizard to create one.');
    }

    const days = await this.prisma.attendanceCalendarDay.findMany({
      where: {
        placementId: placement.id,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        isAttendanceDay: true,
        isPublicHoliday: true,
        holidayName: true,
        confirmedAttended: true,
        hasLogbookEntry: true,
      },
    });

    return {
      placementId: placement.id,
      days: days.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        isAttendanceDay: d.isAttendanceDay,
        isPublicHoliday: d.isPublicHoliday,
        holidayName: d.holidayName,
        confirmedAttended: d.confirmedAttended,
        hasLogbookEntry: d.hasLogbookEntry,
      })),
    };
  }

  /** The single upfront gate: does the student want to include any of the found holidays? */
  async confirmHolidayAttendance(userId: string, confirmedDates: string[]) {
    if (!Array.isArray(confirmedDates)) {
      throw new BadRequestException('confirmedDates must be an array of date strings');
    }

    const placement = await this.prisma.iTPlacement.findUnique({ where: { userId } });
    if (!placement) throw new BadRequestException('No IT placement set up yet');

    const parsedDates = confirmedDates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()));

    if (parsedDates.length !== confirmedDates.length) {
      throw new BadRequestException('One or more confirmedDates values are not valid dates');
    }

    const [attended, notAttended] = await Promise.all([
      this.prisma.attendanceCalendarDay.updateMany({
        where: {
          placementId: placement.id,
          isPublicHoliday: true,
          date: { in: parsedDates },
        },
        data: { confirmedAttended: true },
      }),
      this.prisma.attendanceCalendarDay.updateMany({
        where: {
          placementId: placement.id,
          isPublicHoliday: true,
          date: { notIn: parsedDates },
        },
        data: { confirmedAttended: false },
      }),
    ]);

    // Report what actually changed, so a no-op is visible rather than silent.
    return {
      markedAttended: attended.count,
      markedNotAttended: notAttended.count,
      requested: parsedDates.length,
    };
  }
}
