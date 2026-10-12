import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AI_TRIAL_DAYS } from '../ai/trial';
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

    const calendarRebuild = await this.generateAttendanceCalendar(
      placement.id,
      startDate,
      endDate,
      dto.attendancePattern,
    );

    const summary = await this.getSummary(userId);
    return { ...summary, calendarRebuild };
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
   *
   * Rebuilding is incremental: days whose date is still on the pattern keep
   * their row (and therefore their logbook entry, holiday answer and
   * `hasLogbookEntry` flag). Only days that fall off the pattern are deleted;
   * the entry FK cascades with them. Returns what was dropped so the caller can
   * warn the student instead of losing entries silently.
   */
  private async generateAttendanceCalendar(
    placementId: string,
    startDate: Date,
    endDate: Date,
    attendancePattern: string[],
  ) {
    const holidays = await this.prisma.publicHoliday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    });
    const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h]));

    const rows: {
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
        date: new Date(d),
        isAttendanceDay: true,
        isPublicHoliday: !!holiday,
        holidayName: holiday?.name ?? null,
        // Holiday days wait for the student's yes/no confirmation;
        // ordinary attendance days are assumed attended by default.
        confirmedAttended: holiday ? null : true,
      });
    }

    const existing = await this.prisma.attendanceCalendarDay.findMany({
      where: { placementId },
      select: { id: true, date: true },
    });
    const existingDates = new Set(existing.map((d) => d.date.toISOString().slice(0, 10)));
    const wantedDates = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));

    const staleIds = existing
      .filter((d) => !wantedDates.has(d.date.toISOString().slice(0, 10)))
      .map((d) => d.id);

    const removedEntries =
      staleIds.length > 0
        ? await this.prisma.logbookEntry.count({ where: { calendarDayId: { in: staleIds } } })
        : 0;

    // Only genuinely new dates are inserted; days that survive the edit are left
    // untouched so their ids — and everything hanging off them — stay valid.
    const fresh = rows.filter((r) => !existingDates.has(r.date.toISOString().slice(0, 10)));

    await this.prisma.$transaction(async (tx) => {
      if (staleIds.length > 0) {
        await tx.attendanceCalendarDay.deleteMany({ where: { id: { in: staleIds } } });
      }
      if (fresh.length > 0) {
        await tx.attendanceCalendarDay.createMany({
          data: fresh.map((r) => ({ placementId, ...r })),
        });
      }
    });

    return { removedDays: staleIds.length, removedEntries };
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

    const [totalDays, holidayDays, awaitingAnswer, loggedEntries, trialDays] =
      await Promise.all([
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
        this.prisma.attendanceCalendarDay.findMany({
          where: { placementId: placement.id, confirmedAttended: true },
          orderBy: { date: 'asc' },
          take: AI_TRIAL_DAYS,
          select: { hasLogbookEntry: true },
        }),
      ]);

    const trialUsed = trialDays.filter((d) => d.hasLogbookEntry).length;
    const trial = {
      total: AI_TRIAL_DAYS,
      used: trialUsed,
      // Once spent the window is closed even if entries were later deleted, so
      // report zero remaining rather than reopening the free days.
      remaining: placement.trialWeekUsed ? 0 : trialDays.length - trialUsed,
      spent: placement.trialWeekUsed,
    };

    return {
      ...placement,
      calendarSummary: { totalDays, holidayDays, awaitingAnswer, loggedEntries },
      trial,
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
