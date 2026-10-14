import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogbookService } from './logbook.service';

describe('LogbookService AI single-day polish', () => {
  let prisma: any;
  let llm: any;
  let service: LogbookService;
  const savedUnlock = process.env.AI_DEV_UNLOCK;

  const placement = {
    id: 'p1',
    companyName: 'Acme Ltd',
    industrySector: 'IT',
    trialWeekUsed: false,
  };
  const openDay = { id: 'd1', confirmedAttended: true, hasLogbookEntry: false };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      iTPlacement: {
        findUnique: jest.fn().mockResolvedValue(placement),
        update: jest.fn().mockResolvedValue({}),
      },
      attendanceCalendarDay: {
        findUnique: jest.fn().mockResolvedValue(openDay),
        findMany: jest.fn().mockResolvedValue([{ id: 'd1' }]),
        count: jest.fn().mockResolvedValue(5),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      purchase: { findFirst: jest.fn().mockResolvedValue(null) },
      logbookEntry: {
        create: jest.fn().mockResolvedValue({ id: 'e1' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'e1', calendarDayId: 'd1', status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({ id: 'e1', status: 'REVIEWED' }),
      },
      bulkFillupRequest: { create: jest.fn().mockResolvedValue({}) },
      generationLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    llm = {
      configured: true,
      generate: jest.fn().mockResolvedValue({ text: '  Polished entry.  ', inputTokens: 8, outputTokens: 4 }),
      generateJson: jest.fn(),
    };
    service = new LogbookService(prisma, llm);
    delete process.env.AI_DEV_UNLOCK;
  });

  afterAll(() => {
    if (savedUnlock === undefined) delete process.env.AI_DEV_UNLOCK;
    else process.env.AI_DEV_UNLOCK = savedUnlock;
  });

  describe('polish', () => {
    it('previews a polished entry for a day inside the free trial', async () => {
      const result = await service.polish('u1', { date: '2026-06-01', notes: 'fixed the router' });

      expect(result).toEqual({ activity: 'Polished entry.' });
      expect(prisma.generationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'SINGLE_DAY_POLISH' }),
      });
      // It only previews — nothing is written to the logbook yet.
      expect(prisma.logbookEntry.create).not.toHaveBeenCalled();
    });

    it('refuses a day past the trial when there is no pass', async () => {
      // The trial query returns only the first 7 days, none of which is d1.
      prisma.attendanceCalendarDay.findMany.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({ id: `x${i}` })),
      );

      await expect(
        service.polish('u1', { date: '2026-06-01', notes: 'notes' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it('refuses when the free trial has already been spent', async () => {
      prisma.iTPlacement.findUnique.mockResolvedValue({
        ...placement,
        trialWeekUsed: true,
      });

      await expect(
        service.polish('u1', { date: '2026-06-01', notes: 'notes' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it('lets a pass holder polish any day', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ id: 'buy1' });
      prisma.attendanceCalendarDay.findMany.mockResolvedValue([]);

      await expect(
        service.polish('u1', { date: '2026-06-01', notes: 'notes' }),
      ).resolves.toEqual({ activity: 'Polished entry.' });
    });
  });

  describe('create', () => {
    it('records the source passed by the client', async () => {
      await service.create('u1', {
        date: '2026-06-01',
        activity: 'fixed the router',
        source: 'AI_SINGLE_DAY' as any,
      });

      expect(prisma.logbookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'AI_SINGLE_DAY' }),
        }),
      );
    });

    it('defaults an unlabelled entry to MANUAL', async () => {
      await service.create('u1', { date: '2026-06-01', activity: 'fixed the router' });

      expect(prisma.logbookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'MANUAL' }),
        }),
      );
    });

    it('spends the trial once the last free day is saved by AI', async () => {
      prisma.attendanceCalendarDay.count.mockResolvedValue(0);

      await service.create('u1', {
        date: '2026-06-01',
        activity: 'fixed the router',
        source: 'AI_SINGLE_DAY' as any,
      });

      expect(prisma.iTPlacement.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { trialWeekUsed: true },
      });
    });

    it('does not spend the trial on a manual entry', async () => {
      prisma.attendanceCalendarDay.count.mockResolvedValue(0);

      await service.create('u1', { date: '2026-06-01', activity: 'fixed the router' });

      expect(prisma.iTPlacement.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('advances the review status of an owned entry', async () => {
      const result = await service.update('u1', 'e1', { status: 'REVIEWED' as any });

      expect(result.status).toBe('REVIEWED');
      expect(prisma.logbookEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'REVIEWED' },
        include: { calendarDay: true },
      });
    });

    it('scopes the lookup to the caller and sends only the provided fields', async () => {
      await service.update('u1', 'e1', { status: 'FINALIZED' as any });

      expect(prisma.logbookEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e1', calendarDay: { placement: { userId: 'u1' } } },
        }),
      );
      // A status-only change must not blank the activity or evidence link.
      expect(prisma.logbookEntry.update.mock.calls[0][0].data).toEqual({ status: 'FINALIZED' });
    });

    it("rejects an entry that isn't the caller's", async () => {
      prisma.logbookEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.update('u1', 'someone-elses', { status: 'REVIEWED' as any }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.logbookEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkFillup', () => {
    const extraction = {
      data: { skills: ['networking'] },
      inputTokens: 5,
      outputTokens: 3,
    };
    const generation = {
      data: {
        entries: [
          { date: '2026-06-01', activity: 'Set up the router' },
          { date: '2026-06-08', activity: 'Patched the servers' },
        ],
      },
      inputTokens: 10,
      outputTokens: 20,
    };

    const trialDay = { id: 'd1', date: new Date('2026-06-01') };
    const outsideDay = { id: 'd3', date: new Date('2026-06-08') };

    beforeEach(() => {
      llm.generateJson = jest
        .fn()
        .mockResolvedValueOnce(extraction)
        .mockResolvedValueOnce(generation);
      // The open-day query has no `take`; the trial-day query does.
      prisma.attendanceCalendarDay.findMany.mockImplementation((arg: any) =>
        Promise.resolve(arg?.take ? [trialDay] : [trialDay, outsideDay]),
      );
    });

    it('without a pass fills only the free-trial days, then spends the trial', async () => {
      prisma.attendanceCalendarDay.count.mockResolvedValue(0);

      const result = await service.bulkFillup('u1', { description: 'I did IT support' });

      expect(result).toEqual({ created: 1, lockedRemaining: 1, trial: true });
      expect(prisma.logbookEntry.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.logbookEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ calendarDayId: 'd1', source: 'AI_BULK' })],
      });
      expect(prisma.iTPlacement.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { trialWeekUsed: true },
      });

      // The two model calls are logged separately, not as one lump.
      expect(prisma.generationLog.create).toHaveBeenCalledTimes(2);
      expect(prisma.generationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'EXTRACTION', estimatedTokens: 8 }),
      });
      expect(prisma.generationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'BULK_LOGBOOK', estimatedTokens: 30 }),
      });
    });

    it('is blocked once the free trial is spent, without calling the AI', async () => {
      prisma.iTPlacement.findUnique.mockResolvedValue({
        ...placement,
        trialWeekUsed: true,
      });
      prisma.attendanceCalendarDay.count.mockResolvedValue(2);

      const result = await service.bulkFillup('u1', { description: 'I did IT support' });

      expect(result).toEqual({
        created: 0,
        lockedRemaining: 2,
        trial: true,
        message: 'Your free week is used up. The IT/SIWES Pass unlocks the rest.',
      });
      expect(llm.generateJson).not.toHaveBeenCalled();
    });

    it('does not call the AI when there is nothing left to fill', async () => {
      // Every open day already has an entry.
      prisma.attendanceCalendarDay.findMany.mockResolvedValue([]);

      const result = await service.bulkFillup('u1', { description: 'I did IT support' });

      expect(result).toEqual({
        created: 0,
        lockedRemaining: 0,
        trial: true,
        message: 'Every confirmed attendance day already has an entry.',
      });
      expect(llm.generateJson).not.toHaveBeenCalled();
    });
  });
});
