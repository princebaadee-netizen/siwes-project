import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReportService, durationBetween } from './report.service';
import { REPORT_SECTION_KINDS } from './report.sections';

function makeSections(byKind: Record<string, any> = {}) {
  return REPORT_SECTION_KINDS.map((kind) => ({
    id: kind.toLowerCase(),
    reportId: 'r1',
    kind,
    content: null,
    status: 'DRAFT',
    regenerationsUsed: 0,
    ...(byKind[kind] ?? {}),
  }));
}

function makeReport(overrides: Record<string, any> = {}) {
  return {
    id: 'r1',
    userId: 'u1',
    institutionName: null,
    institutionAddress: null,
    faculty: null,
    department: null,
    programme: null,
    level: null,
    matricNumber: null,
    schoolSupervisor: null,
    companySupervisor: null,
    durationLabel: 'Six Months',
    submissionDate: null,
    logoUrl: null,
    coverImageUrl: null,
    dedicationNames: [],
    status: 'DRAFT',
    sections: makeSections(),
    ...overrides,
  };
}

describe('ReportService', () => {
  let prisma: any;
  let llm: any;
  let service: ReportService;

  const saved = {
    unlock: process.env.AI_DEV_UNLOCK,
    admins: process.env.ADMIN_EMAILS,
    regens: process.env.AI_MAX_REGENERATIONS,
  };

  /** Points every report lookup at the same fixture. */
  function useReport(report: any) {
    prisma.siwesReport.findUnique.mockResolvedValue(report);
    prisma.siwesReport.findUniqueOrThrow.mockResolvedValue(report);
    return report;
  }

  beforeEach(() => {
    prisma = {
      siwesReport: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      siwesReportSection: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(),
      },
      iTPlacement: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          fullName: 'Ada Obi',
          school: 'UNIPORT',
          department: 'Computer Science',
          email: 'ada@example.com',
        }),
      },
      logbookEntry: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findFirst: jest.fn().mockResolvedValue(null) },
      purchase: { findFirst: jest.fn().mockResolvedValue(null) },
      generationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    llm = {
      configured: true,
      generate: jest
        .fn()
        .mockResolvedValue({ text: '  written prose  ', inputTokens: 12, outputTokens: 30 }),
      generateJson: jest.fn(),
    };
    service = new ReportService(prisma, llm);
    delete process.env.AI_DEV_UNLOCK;
    delete process.env.ADMIN_EMAILS;
    delete process.env.AI_MAX_REGENERATIONS;
  });

  afterAll(() => {
    for (const [key, value] of [
      ['AI_DEV_UNLOCK', saved.unlock],
      ['ADMIN_EMAILS', saved.admins],
      ['AI_MAX_REGENERATIONS', saved.regens],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('get', () => {
    it('returns the report without its relation, sections in document order, and defaults', async () => {
      useReport(makeReport());
      prisma.iTPlacement.findUnique.mockResolvedValue({
        companyName: 'Acme Ltd',
        companyAddress: '1 Industrial Way',
        industrySector: 'IT',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      });
      prisma.logbookEntry.findMany.mockResolvedValue([
        { activity: 'Set up the router', calendarDay: { date: new Date('2026-01-02') } },
        { activity: 'Patched the servers', calendarDay: { date: new Date('2026-01-03') } },
      ]);
      prisma.project.findFirst.mockResolvedValue({ title: 'Attendance System' });

      const view = await service.get('u1');

      expect((view.report as any).sections).toBeUndefined();
      expect(view.sections.map((s) => s.kind)).toEqual(REPORT_SECTION_KINDS);
      expect(view.logbookCount).toBe(2);
      expect(view.canGenerate).toBe(false);
      expect(view.defaults).toMatchObject({
        fullName: 'Ada Obi',
        school: 'UNIPORT',
        companyName: 'Acme Ltd',
        projectTitle: 'Attendance System',
      });
    });

    it('lazily creates the report and all sections, deriving duration from the placement', async () => {
      const created = makeReport({ durationLabel: 'Six Months' });
      prisma.siwesReport.findUnique.mockResolvedValue(null);
      prisma.siwesReport.create.mockResolvedValue(created);
      prisma.siwesReport.findUniqueOrThrow.mockResolvedValue(created);
      prisma.iTPlacement.findUnique.mockResolvedValue({
        companyName: 'Acme Ltd',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
      });

      await service.get('u1');

      expect(prisma.siwesReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            durationLabel: 'Six Months',
            sections: { create: REPORT_SECTION_KINDS.map((kind) => ({ kind })) },
          }),
          include: { sections: true },
        }),
      );
    });

    it('fills in sections added after the report was first created', async () => {
      const partial = makeReport({
        sections: makeSections().filter((s) => s.kind !== 'SKILLS_ACQUIRED'),
      });
      prisma.siwesReport.findUnique.mockResolvedValue(partial);
      prisma.siwesReport.findUniqueOrThrow.mockResolvedValue(makeReport());

      await service.get('u1');

      expect(prisma.siwesReportSection.createMany).toHaveBeenCalledWith({
        data: [{ reportId: 'r1', kind: 'SKILLS_ACQUIRED' }],
      });
    });
  });

  describe('generateSection', () => {
    it('fails clearly when the AI is not configured', async () => {
      llm.configured = false;
      useReport(makeReport());

      await expect(service.generateSection('u1', 'ABSTRACT')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it('refuses without the IT/SIWES Pass, without calling the AI', async () => {
      useReport(makeReport());

      await expect(service.generateSection('u1', 'ABSTRACT')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it('writes, trims, saves and logs the usage for a pass holder', async () => {
      useReport(makeReport());
      prisma.purchase.findFirst.mockResolvedValue({ id: 'buy1' });
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'ABSTRACT',
        content: 'written prose',
        status: 'DRAFT',
        regenerationsUsed: 0,
      });

      const result = await service.generateSection('u1', 'ABSTRACT', 'mention the weekend shift');

      const [, prompt, maxTokens] = llm.generate.mock.calls[0];
      expect(prompt).toContain('Additional guidance from the student: mention the weekend shift');
      expect(maxTokens).toBe(2000);
      expect(prisma.siwesReportSection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reportId_kind: { reportId: 'r1', kind: 'ABSTRACT' } },
          create: expect.objectContaining({ content: 'written prose' }),
        }),
      );
      expect(prisma.generationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'REPORT_SECTION', estimatedTokens: 42 }),
      });
      expect(result).toMatchObject({
        kind: 'ABSTRACT',
        title: 'Abstract',
        chapter: null,
        content: 'written prose',
      });
    });

    it('lets an admin email bypass the pass', async () => {
      useReport(makeReport());
      process.env.ADMIN_EMAILS = 'ada@example.com';
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'ABSTRACT',
        content: 'x',
        status: 'DRAFT',
        regenerationsUsed: 0,
      });

      await expect(service.generateSection('u1', 'ABSTRACT')).resolves.toBeDefined();
      expect(prisma.purchase.findFirst).not.toHaveBeenCalled();
    });

    it('honours the AI_DEV_UNLOCK bypass', async () => {
      useReport(makeReport());
      process.env.AI_DEV_UNLOCK = 'true';
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'ABSTRACT',
        content: 'x',
        status: 'DRAFT',
        regenerationsUsed: 0,
      });

      await expect(service.generateSection('u1', 'ABSTRACT')).resolves.toBeDefined();
      expect(prisma.purchase.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('regeneration', () => {
    it('blocks a rewrite once the section hits its limit', async () => {
      useReport(makeReport({ sections: makeSections({ ABSTRACT: { regenerationsUsed: 3 } }) }));

      await expect(service.regenerateSection('u1', 'ABSTRACT')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it('counts each successful rewrite', async () => {
      useReport(
        makeReport({
          sections: makeSections({ ABSTRACT: { content: 'old', regenerationsUsed: 1 } }),
        }),
      );
      prisma.purchase.findFirst.mockResolvedValue({ id: 'buy1' });
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'ABSTRACT',
        content: 'new',
        status: 'DRAFT',
        regenerationsUsed: 2,
      });

      await service.regenerateSection('u1', 'ABSTRACT');

      expect(prisma.siwesReportSection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ regenerationsUsed: { increment: 1 } }),
        }),
      );
    });

    it('lets an admin exceed the limit', async () => {
      useReport(makeReport({ sections: makeSections({ ABSTRACT: { regenerationsUsed: 9 } }) }));
      process.env.ADMIN_EMAILS = 'ada@example.com';
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'ABSTRACT',
        content: 'x',
        status: 'DRAFT',
        regenerationsUsed: 10,
      });

      await expect(service.regenerateSection('u1', 'ABSTRACT')).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('converts the submission date and keeps the derived duration when cleared', async () => {
      const report = makeReport();
      useReport(report);
      prisma.siwesReport.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...report, ...data }),
      );

      await service.update('u1', { submissionDate: '2026-06-15', durationLabel: '' } as any);

      const data = prisma.siwesReport.update.mock.calls[0][0].data;
      expect(data.submissionDate).toBeInstanceOf(Date);
      expect('durationLabel' in data).toBe(false);
    });

    it('sends only the provided fields', async () => {
      const report = makeReport();
      useReport(report);
      prisma.siwesReport.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...report, ...data }),
      );

      await service.update('u1', { institutionName: 'UNIPORT', matricNumber: 'U/2020/1' } as any);

      expect(prisma.siwesReport.update.mock.calls[0][0].data).toEqual({
        institutionName: 'UNIPORT',
        matricNumber: 'U/2020/1',
      });
    });
  });

  describe('updateSection', () => {
    it('upserts the content/status and returns the decorated view', async () => {
      useReport(makeReport());
      prisma.siwesReportSection.upsert.mockResolvedValue({
        kind: 'INTRODUCTION',
        content: 'intro text',
        status: 'REVIEWED',
        regenerationsUsed: 0,
      });

      const result = await service.updateSection('u1', 'INTRODUCTION', {
        content: 'intro text',
        status: 'REVIEWED',
      });

      expect(prisma.siwesReportSection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reportId_kind: { reportId: 'r1', kind: 'INTRODUCTION' } },
          update: { content: 'intro text', status: 'REVIEWED' },
        }),
      );
      expect(result).toMatchObject({
        kind: 'INTRODUCTION',
        title: 'Introduction',
        chapter: 1,
        status: 'REVIEWED',
      });
    });
  });

  describe('generateAll', () => {
    function blankExcept(...keep: string[]) {
      return makeSections().map((s) =>
        keep.includes(s.kind) ? { ...s, content: 'already written' } : s,
      );
    }

    it('writes only the blank sections and records them', async () => {
      useReport(makeReport({ sections: blankExcept('ABSTRACT') }));
      prisma.purchase.findFirst.mockResolvedValue({ id: 'buy1' });
      prisma.siwesReportSection.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ ...create, status: 'DRAFT', regenerationsUsed: 0 }),
      );

      const result = await service.generateAll('u1');

      expect(result.generated).toEqual(
        expect.arrayContaining(['INTRODUCTION', 'SKILLS_ACQUIRED', 'DISCUSSION_CONCLUSION']),
      );
      expect(result.generated).not.toContain('ABSTRACT');
      expect(result.failed).toEqual([]);
      const abstractUpserts = prisma.siwesReportSection.upsert.mock.calls.filter(
        ([arg]: any[]) => arg.where.reportId_kind.kind === 'ABSTRACT',
      );
      expect(abstractUpserts).toHaveLength(0);
    });

    it('keeps going and reports a section that fails', async () => {
      useReport(makeReport({ sections: blankExcept('ABSTRACT', 'DEDICATION', 'ACKNOWLEDGMENT', 'INDUSTRIAL_EXPERIENCE', 'DISCUSSION_CONCLUSION') }));
      prisma.purchase.findFirst.mockResolvedValue({ id: 'buy1' });
      llm.generate.mockImplementation((_system: string, prompt: string) =>
        prompt.includes('Skills Acquired')
          ? Promise.reject(new Error('rate limited'))
          : Promise.resolve({ text: 'ok', inputTokens: 1, outputTokens: 1 }),
      );
      prisma.siwesReportSection.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ ...create, status: 'DRAFT', regenerationsUsed: 0 }),
      );

      const result = await service.generateAll('u1');

      expect(result.generated).toContain('INTRODUCTION');
      expect(result.failed).toContain('SKILLS_ACQUIRED');
    });
  });

  describe('attachImage', () => {
    it('rejects a missing file', async () => {
      await expect(service.attachImage('u1', 'logoUrl', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a non-image upload', async () => {
      await expect(
        service.attachImage('u1', 'logoUrl', {
          mimetype: 'application/pdf',
          buffer: Buffer.from(''),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('durationBetween', () => {
  it('counts inclusive month spans as words', () => {
    expect(durationBetween(new Date('2026-01-01'), new Date('2026-01-31'))).toBe('One Month');
    expect(durationBetween(new Date('2026-01-01'), new Date('2026-03-31'))).toBe('Three Months');
    expect(durationBetween(new Date('2026-01-01'), new Date('2026-06-30'))).toBe('Six Months');
  });

  it('falls back to a number past the named range', () => {
    expect(durationBetween(new Date('2026-01-01'), new Date('2027-01-31'))).toBe('13 Months');
  });
});
