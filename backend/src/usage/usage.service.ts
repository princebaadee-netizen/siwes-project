import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getTokenRates } from '../ai/token-cost';

const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 100;

/**
 * Read-only view over the user's own `GenerationLog` rows, so the account page
 * can show how much AI work has been done and what it is estimated to have cost.
 */
@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService) {}

  async summary(userId: string, limit?: number) {
    const recentLimit = Math.min(
      Math.max(Math.trunc(limit ?? DEFAULT_RECENT_LIMIT), 1),
      MAX_RECENT_LIMIT,
    );

    const [totals, byType, recent] = await Promise.all([
      this.prisma.generationLog.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: { estimatedTokens: true, estimatedCostKobo: true },
      }),
      this.prisma.generationLog.groupBy({
        by: ['type'],
        where: { userId },
        _count: { _all: true },
        _sum: { estimatedTokens: true, estimatedCostKobo: true },
      }),
      this.prisma.generationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        select: {
          id: true,
          type: true,
          estimatedTokens: true,
          estimatedCostKobo: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totals: {
        generations: totals._count._all,
        tokens: totals._sum.estimatedTokens ?? 0,
        costKobo: totals._sum.estimatedCostKobo ?? 0,
      },
      byType: byType
        .map((row) => ({
          type: row.type,
          generations: row._count._all,
          tokens: row._sum.estimatedTokens ?? 0,
          costKobo: row._sum.estimatedCostKobo ?? 0,
        }))
        .sort((a, b) => b.generations - a.generations),
      recent,
      pricing: getTokenRates(),
    };
  }
}
