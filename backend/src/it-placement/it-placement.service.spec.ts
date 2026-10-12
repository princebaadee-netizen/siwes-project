import { NotFoundException } from '@nestjs/common';
import { ItPlacementService } from './it-placement.service';

describe('ItPlacementService summary trial', () => {
  let prisma: any;
  let service: ItPlacementService;

  const placement = {
    id: 'p1',
    userId: 'u1',
    companyName: 'Acme Ltd',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-08-01'),
    attendancePattern: ['mon', 'wed'],
    trialWeekUsed: false,
  };

  beforeEach(() => {
    prisma = {
      iTPlacement: { findUnique: jest.fn().mockResolvedValue(placement) },
      attendanceCalendarDay: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ItPlacementService(prisma);
  });

  it('reports the free-trial days still open', async () => {
    prisma.attendanceCalendarDay.findMany.mockResolvedValue([
      { hasLogbookEntry: true },
      { hasLogbookEntry: true },
      { hasLogbookEntry: false },
    ]);

    const summary = await service.getSummary('u1');

    expect(summary.trial).toEqual({ total: 7, used: 2, remaining: 1, spent: false });
    // The trial window is the first 7 confirmed attendance days.
    const arg = prisma.attendanceCalendarDay.findMany.mock.calls[0][0];
    expect(arg.take).toBe(7);
    expect(arg.where).toEqual({ placementId: 'p1', confirmedAttended: true });
  });

  it('reports zero remaining once the trial is spent, even if days reopen', async () => {
    prisma.iTPlacement.findUnique.mockResolvedValue({ ...placement, trialWeekUsed: true });
    prisma.attendanceCalendarDay.findMany.mockResolvedValue([
      { hasLogbookEntry: false },
      { hasLogbookEntry: false },
    ]);

    const summary = await service.getSummary('u1');

    expect(summary.trial).toEqual({ total: 7, used: 0, remaining: 0, spent: true });
  });

  it('404s when there is no placement', async () => {
    prisma.iTPlacement.findUnique.mockResolvedValue(null);

    await expect(service.getSummary('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
