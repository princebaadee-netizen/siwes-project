import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PurchaseProductType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from '../ai/llm.service';
import { CreateLogbookEntryDto } from './dto/create-logbook-entry.dto';
import { UpdateLogbookEntryDto } from './dto/update-logbook-entry.dto';
import { BulkFillupDto } from './dto/bulk-fillup.dto';
import {
  EXTRACTION_SYSTEM,
  GENERATION_SYSTEM,
  extractionPrompt,
  generationPrompt,
} from './bulk-fillup.prompt';

const withDay = { calendarDay: { include: { placement: true } } } as const;

// The plan's free trial: the first week of an AI-written logbook is free, the
// rest needs an IT/SIWES Pass. Until payments exist nobody has a pass, so in
// practice everyone gets the trial (or everything, with AI_DEV_UNLOCK).
const AI_TRIAL_DAYS = 7;

@Injectable()
export class LogbookService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
  ) {}

  private async hasPass(userId: string, productType: PurchaseProductType): Promise<boolean> {
    if (process.env.AI_DEV_UNLOCK === 'true') return true;
    // The bundle grants both passes, so a successful BUNDLE also counts.
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        userId,
        productType: { in: [productType, PurchaseProductType.BUNDLE] },
        status: 'SUCCESSFUL',
      },
    });
    return !!purchase;
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async placementFor(userId: string) {
    const placement = await this.prisma.iTPlacement.findUnique({ where: { userId } });
    if (!placement) {
      throw new NotFoundException('No IT placement set up yet. Complete onboarding first.');
    }
    return placement;
  }

  /**
   * Every entry is keyed by the generated calendar day rather than a free date,
   * so an entry can only exist for a day that is actually on the student's
   * attendance pattern. That keeps the calendar, the entry count and the
   * printed logbook from drifting apart.
   */
  private async calendarDayFor(placementId: string, rawDate: string) {
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('date must be a valid date');
    }

    const day = await this.prisma.attendanceCalendarDay.findUnique({
      where: { placementId_date: { placementId, date } },
    });
    if (!day) {
      throw new BadRequestException(
        'That date is not an attendance day for this placement. Pick a day from your calendar.',
      );
    }
    return day;
  }

  /** Ownership is checked through the placement relation, never by id alone. */
  private async ownedEntry(userId: string, id: string) {
    const entry = await this.prisma.logbookEntry.findFirst({
      where: { id, calendarDay: { placement: { userId } } },
      include: withDay,
    });
    if (!entry) throw new NotFoundException('Logbook entry not found');
    return entry;
  }

  async list(userId: string) {
    const placement = await this.placementFor(userId);
    return this.prisma.logbookEntry.findMany({
      where: { calendarDay: { placementId: placement.id } },
      include: { calendarDay: true },
      orderBy: { calendarDay: { date: 'asc' } },
    });
  }

  async create(userId: string, dto: CreateLogbookEntryDto) {
    const placement = await this.placementFor(userId);
    const day = await this.calendarDayFor(placement.id, dto.date);

    if (day.confirmedAttended === null) {
      throw new BadRequestException(
        'Confirm whether you worked this date before adding an entry.',
      );
    }
    if (!day.confirmedAttended) {
      throw new BadRequestException(
        'You marked this date as not attended, so it cannot have a logbook entry.',
      );
    }
    if (day.hasLogbookEntry) {
      throw new ConflictException('A logbook entry already exists for this date.');
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.logbookEntry.create({
        data: {
          calendarDayId: day.id,
          activity: dto.activity.trim(),
          evidenceUrl: dto.evidenceUrl ?? null,
        },
        include: { calendarDay: true },
      });
      await tx.attendanceCalendarDay.update({
        where: { id: day.id },
        data: { hasLogbookEntry: true },
      });
      return entry;
    });
  }

  /**
   * The "describe your whole IT" flow: extract facts from the free text, then
   * draft one entry per open attendance day. The first `AI_TRIAL_DAYS` are
   * generated for free; a successful IT/SIWES Pass unlocks the rest.
   */
  async bulkFillup(userId: string, dto: BulkFillupDto) {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException(
        'AI logbook generation is not configured. Set ANTHROPIC_API_KEY on the backend.',
      );
    }

    const placement = await this.placementFor(userId);

    const extraction = await this.llm.generateJson<{
      school?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      skills?: string[];
    }>(EXTRACTION_SYSTEM, extractionPrompt(dto.description), 1000);

    await this.prisma.bulkFillupRequest.create({
      data: {
        placementId: placement.id,
        rawInputText: dto.description,
        extractedSchool: extraction.data.school ?? null,
        extractedStartDate: this.parseDate(extraction.data.startDate),
        extractedEndDate: this.parseDate(extraction.data.endDate),
        extractedSkills: Array.isArray(extraction.data.skills) ? extraction.data.skills : [],
      },
    });

    const openDays = await this.prisma.attendanceCalendarDay.findMany({
      where: { placementId: placement.id, confirmedAttended: true, hasLogbookEntry: false },
      orderBy: { date: 'asc' },
    });

    const hasItPass = await this.hasPass(userId, PurchaseProductType.IT_SIWES_PASS);
    const limit = hasItPass ? openDays.length : Math.min(openDays.length, AI_TRIAL_DAYS);
    const target = openDays.slice(0, limit);
    const lockedRemaining = openDays.length - target.length;

    if (target.length === 0) {
      return {
        created: 0,
        lockedRemaining,
        trial: !hasItPass,
        message: 'Every confirmed attendance day already has an entry.',
      };
    }

    const generation = await this.llm.generateJson<{
      entries?: { date: string; activity: string }[];
    }>(
      GENERATION_SYSTEM,
      generationPrompt(
        {
          companyName: placement.companyName,
          industrySector: placement.industrySector,
          skills: extraction.data.skills ?? [],
        },
        target.map((d) => d.date.toISOString().slice(0, 10)),
      ),
      4000,
    );

    const dayByDate = new Map(target.map((d) => [d.date.toISOString().slice(0, 10), d]));
    const validEntries = (generation.data.entries ?? []).filter(
      (e) => e?.date && e?.activity?.trim() && dayByDate.has(e.date),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const e of validEntries) {
        const day = dayByDate.get(e.date);
        if (!day) continue;
        await tx.logbookEntry.create({
          data: { calendarDayId: day.id, activity: e.activity.trim(), source: 'AI_BULK' },
        });
        await tx.attendanceCalendarDay.update({
          where: { id: day.id },
          data: { hasLogbookEntry: true },
        });
        count++;
      }
      return count;
    });

    await this.prisma.generationLog.create({
      data: {
        userId,
        type: 'BULK_LOGBOOK',
        estimatedTokens:
          extraction.inputTokens +
          extraction.outputTokens +
          generation.inputTokens +
          generation.outputTokens,
      },
    });

    return { created, lockedRemaining, trial: !hasItPass };
  }

  async findOne(userId: string, id: string) {
    return this.ownedEntry(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateLogbookEntryDto) {
    await this.ownedEntry(userId, id);

    return this.prisma.logbookEntry.update({
      where: { id },
      data: {
        ...(dto.activity !== undefined ? { activity: dto.activity.trim() } : {}),
        ...(dto.evidenceUrl !== undefined ? { evidenceUrl: dto.evidenceUrl || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { calendarDay: true },
    });
  }

  async remove(userId: string, id: string) {
    const entry = await this.ownedEntry(userId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.logbookEntry.delete({ where: { id } });
      await tx.attendanceCalendarDay.update({
        where: { id: entry.calendarDayId },
        data: { hasLogbookEntry: false },
      });
    });

    return { deleted: true };
  }
}
