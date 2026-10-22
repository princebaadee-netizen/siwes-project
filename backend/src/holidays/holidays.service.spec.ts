import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HolidaysService } from './holidays.service';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
  });
}

describe('HolidaysService', () => {
  let prisma: any;
  let service: HolidaysService;

  beforeEach(() => {
    prisma = {
      publicHoliday: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new HolidaysService(prisma);
  });

  it('lists holidays ordered by year then date', async () => {
    prisma.publicHoliday.findMany.mockResolvedValue([]);

    await service.list();

    const arg = prisma.publicHoliday.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ year: 'asc' }, { date: 'asc' }]);
  });

  describe('create', () => {
    it('trims the name and derives the year from the date', async () => {
      prisma.publicHoliday.create.mockResolvedValue({ id: 'h1' });

      await service.create({ date: '2027-03-26', name: '  Good Friday  ' });

      expect(prisma.publicHoliday.create).toHaveBeenCalledWith({
        data: { date: new Date('2027-03-26'), name: 'Good Friday', year: 2027 },
      });
    });

    it('maps a duplicate date+name to a 409', async () => {
      prisma.publicHoliday.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create({ date: '2027-03-26', name: 'Good Friday' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('recomputes the year when only the date changes', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue({
        id: 'h1',
        date: new Date('2027-03-26'),
        name: 'Good Friday',
        year: 2027,
      });
      prisma.publicHoliday.update.mockResolvedValue({ id: 'h1' });

      await service.update('h1', { date: '2028-04-16' });

      expect(prisma.publicHoliday.update).toHaveBeenCalledWith({
        where: { id: 'h1' },
        data: { date: new Date('2028-04-16'), name: 'Good Friday', year: 2028 },
      });
    });

    it('keeps the existing date and year when only the name changes', async () => {
      const date = new Date('2027-03-26');
      prisma.publicHoliday.findUnique.mockResolvedValue({
        id: 'h1',
        date,
        name: 'Good Friday',
        year: 2027,
      });
      prisma.publicHoliday.update.mockResolvedValue({ id: 'h1' });

      await service.update('h1', { name: ' Good Friday (FG) ' });

      expect(prisma.publicHoliday.update).toHaveBeenCalledWith({
        where: { id: 'h1' },
        data: { date, name: 'Good Friday (FG)', year: 2027 },
      });
    });

    it('maps a missing row to a 404', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a duplicate date+name to a 409', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue({
        id: 'h1',
        date: new Date('2027-03-26'),
        name: 'Good Friday',
        year: 2027,
      });
      prisma.publicHoliday.update.mockRejectedValue(prismaError('P2002'));

      await expect(service.update('h1', { date: '2027-03-29' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the row and reports success', async () => {
      prisma.publicHoliday.delete.mockResolvedValue({ id: 'h1' });

      await expect(service.remove('h1')).resolves.toEqual({ ok: true });
      expect(prisma.publicHoliday.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
    });

    it('maps a missing row to a 404', async () => {
      prisma.publicHoliday.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
