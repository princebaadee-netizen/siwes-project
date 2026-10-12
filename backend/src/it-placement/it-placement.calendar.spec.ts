import { ItPlacementService } from './it-placement.service';

/**
 * A placement edit used to delete every calendar day and recreate them, which
 * tripped the logbook-entry FK (ON DELETE RESTRICT) as soon as any day had been
 * logged. The rebuild is now incremental: surviving days keep their id, only
 * days that fall off the pattern are deleted, and the caller is told how many
 * entries went with them.
 */
describe('ItPlacementService calendar rebuild', () => {
  let prisma: any;
  let service: ItPlacementService;

  const placement = {
    id: 'p1',
    userId: 'u1',
    companyName: 'Acme Ltd',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-14'),
    attendancePattern: ['mon'],
    daysPerWeek: 1,
    trialWeekUsed: false,
  };

  beforeEach(() => {
    prisma = {
      iTPlacement: {
        upsert: jest.fn().mockResolvedValue(placement),
        findUnique: jest.fn().mockResolvedValue(placement),
      },
      publicHoliday: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceCalendarDay: {
        // Two different reads share this mock: the rebuild asks for ids/dates,
        // the summary asks for trial-day flags. Distinguish by the select.
        findMany: jest.fn((arg: any) =>
          Promise.resolve(arg?.select?.id ? existingDays : []),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      logbookEntry: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    service = new ItPlacementService(prisma);
  });

  // d1 is still a Monday in the new window; d2 fell off it and carries entries.
  const existingDays = [
    { id: 'd1', date: new Date('2026-06-01') },
    { id: 'd2', date: new Date('2026-05-04') },
  ];

  it('keeps surviving days, deletes only the dropped ones, and reports lost entries', async () => {
    const result = await service.create('u1', {
      companyName: 'Acme Ltd',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      daysPerWeek: 1,
      attendancePattern: ['mon'],
    });

    expect(result.calendarRebuild).toEqual({ removedDays: 1, removedEntries: 2 });

    // The day that fell off the pattern is deleted ...
    expect(prisma.attendanceCalendarDay.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['d2'] } },
    });

    // ... and only the genuinely new Monday (the 8th) is created; the surviving
    // 1st is not recreated, so its entry stays attached.
    const created = prisma.attendanceCalendarDay.createMany.mock.calls[0][0].data;
    expect(created.map((d: any) => d.date.toISOString().slice(0, 10))).toEqual(['2026-06-08']);
  });

  it('reports nothing removed when the pattern is unchanged', async () => {
    prisma.attendanceCalendarDay.findMany.mockImplementation((arg: any) =>
      Promise.resolve(
        arg?.select?.id
          ? [
              { id: 'd1', date: new Date('2026-06-01') },
              { id: 'd3', date: new Date('2026-06-08') },
            ]
          : [],
      ),
    );

    const result = await service.create('u1', {
      companyName: 'Acme Ltd',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      daysPerWeek: 1,
      attendancePattern: ['mon'],
    });

    expect(result.calendarRebuild).toEqual({ removedDays: 0, removedEntries: 0 });
    expect(prisma.attendanceCalendarDay.deleteMany).not.toHaveBeenCalled();
    expect(prisma.logbookEntry.count).not.toHaveBeenCalled();
    expect(prisma.attendanceCalendarDay.createMany).not.toHaveBeenCalled();
  });
});
