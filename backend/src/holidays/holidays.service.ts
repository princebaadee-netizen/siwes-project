import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

/**
 * Admin CRUD over the federal public-holiday list. The list is consulted
 * whenever an attendance calendar is generated, so edits here flow into
 * calendars created from then on (existing placements keep theirs until a
 * placement rebuild).
 */
@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.publicHoliday.findMany({ orderBy: [{ year: 'asc' }, { date: 'asc' }] });
  }

  async create(dto: CreateHolidayDto) {
    const date = new Date(dto.date);
    try {
      return await this.prisma.publicHoliday.create({
        data: { date, name: dto.name.trim(), year: date.getUTCFullYear() },
      });
    } catch (err) {
      throw this.translateUnique(err, 'That holiday already exists.');
    }
  }

  async update(id: string, dto: UpdateHolidayDto) {
    const existing = await this.prisma.publicHoliday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');

    // Recompute both derived fields from the merged result so the year can
    // never drift from the date.
    const date = dto.date !== undefined ? new Date(dto.date) : existing.date;
    const name = dto.name !== undefined ? dto.name.trim() : existing.name;

    try {
      return await this.prisma.publicHoliday.update({
        where: { id },
        data: { date, name, year: date.getUTCFullYear() },
      });
    } catch (err) {
      throw this.translateUnique(err, 'That holiday already exists.');
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.publicHoliday.delete({ where: { id } });
    } catch (err) {
      throw this.translateMissing(err);
    }
    return { ok: true };
  }

  private translateUnique(err: unknown, message: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(message);
    }
    return err;
  }

  private translateMissing(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return new NotFoundException('Holiday not found');
    }
    return err;
  }
}
