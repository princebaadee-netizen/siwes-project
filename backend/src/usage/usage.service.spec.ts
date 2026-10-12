import { UsageService } from './usage.service';

describe('UsageService', () => {
  let prisma: any;
  let service: UsageService;

  beforeEach(() => {
    prisma = {
      generationLog: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 4 },
          _sum: { estimatedTokens: 1000, estimatedCostKobo: 2500 },
        }),
        groupBy: jest.fn().mockResolvedValue([
          {
            type: 'CHAPTER_DRAFT',
            _count: { _all: 1 },
            _sum: { estimatedTokens: 400, estimatedCostKobo: 1200 },
          },
          {
            type: 'BULK_LOGBOOK',
            _count: { _all: 3 },
            _sum: { estimatedTokens: 600, estimatedCostKobo: 1300 },
          },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new UsageService(prisma);
  });

  it('summarises totals, by-type and recent activity for the user', async () => {
    const result = await service.summary('u1');

    expect(result.totals).toEqual({ generations: 4, tokens: 1000, costKobo: 2500 });
    // Ordered by number of generations, most used first.
    expect(result.byType.map((r) => r.type)).toEqual(['BULK_LOGBOOK', 'CHAPTER_DRAFT']);
    expect(result.byType[0]).toEqual({
      type: 'BULK_LOGBOOK',
      generations: 3,
      tokens: 600,
      costKobo: 1300,
    });

    expect(prisma.generationLog.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prisma.generationLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['type'], where: { userId: 'u1' } }),
    );
    expect(prisma.generationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, take: 20 }),
    );
  });

  it('defaults missing sums to zero', async () => {
    prisma.generationLog.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { estimatedTokens: null, estimatedCostKobo: null },
    });
    prisma.generationLog.groupBy.mockResolvedValue([]);

    const result = await service.summary('u1');

    expect(result.totals).toEqual({ generations: 0, tokens: 0, costKobo: 0 });
    expect(result.byType).toEqual([]);
  });

  it('clamps the recent limit into a safe range', async () => {
    await service.summary('u1', 5000);
    expect(prisma.generationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );

    await service.summary('u1', 0);
    expect(prisma.generationLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('exposes the pricing rates used to estimate cost', async () => {
    const result = await service.summary('u1');
    expect(result.pricing).toEqual({
      inputKoboPerMtok: expect.any(Number),
      outputKoboPerMtok: expect.any(Number),
    });
  });
});
