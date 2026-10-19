import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';

describe('ProjectsService chapter regeneration', () => {
  let prisma: any;
  let llm: any;
  let service: ProjectsService;
  const savedMax = process.env.AI_MAX_REGENERATIONS;

  function projectWith(regenerationsUsed: number) {
    return {
      id: 'pr1',
      title: 'An App',
      status: 'IN_PROGRESS',
      chapters: [
        {
          id: 'c1',
          chapterNumber: 1,
          title: 'Introduction',
          isFreeUnlocked: true,
          regenerationsUsed,
          rawInputText: 'my notes',
          content: 'old draft',
        },
      ],
    };
  }

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      project: { findFirst: jest.fn().mockResolvedValue(projectWith(0)) },
      projectChapter: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'c1', content: 'new', status: 'DRAFT', regenerationsUsed: 1 }),
      },
      generationLog: { create: jest.fn().mockResolvedValue({}) },
      purchase: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    llm = {
      configured: true,
      generate: jest
        .fn()
        .mockResolvedValue({ text: 'drafted', inputTokens: 5, outputTokens: 5 }),
    };
    service = new ProjectsService(prisma, llm);
    delete process.env.AI_MAX_REGENERATIONS;
  });

  afterAll(() => {
    if (savedMax === undefined) delete process.env.AI_MAX_REGENERATIONS;
    else process.env.AI_MAX_REGENERATIONS = savedMax;
  });

  it('increments the regeneration count and logs the generation', async () => {
    await service.regenerateChapter('u1', 'pr1', 1, 'new notes');

    expect(prisma.projectChapter.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ regenerationsUsed: { increment: 1 } }),
    });
    expect(prisma.generationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'CHAPTER_DRAFT' }),
    });
  });

  it('reuses the stored notes when none are sent', async () => {
    await service.regenerateChapter('u1', 'pr1', 1);

    const prompt = llm.generate.mock.calls[0][1];
    expect(prompt).toContain('my notes');
  });

  it('refuses once the default regeneration limit is reached', async () => {
    prisma.project.findFirst.mockResolvedValue(projectWith(3));

    await expect(service.regenerateChapter('u1', 'pr1', 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('honours a custom limit from the environment', async () => {
    process.env.AI_MAX_REGENERATIONS = '5';
    prisma.project.findFirst.mockResolvedValue(projectWith(3));

    await expect(service.regenerateChapter('u1', 'pr1', 1, 'notes')).resolves.toBeDefined();
  });

  it('does not count a first draft as a regeneration', async () => {
    await service.draftChapter('u1', 'pr1', 1, 'first notes');

    expect(prisma.projectChapter.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.not.objectContaining({ regenerationsUsed: expect.anything() }),
    });
  });
});

describe('ProjectsService topic suggestions', () => {
  let prisma: any;
  let llm: any;
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ department: 'Computer Science' }) },
      generationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    llm = { configured: true, generateJson: jest.fn() };
    service = new ProjectsService(prisma, llm);
  });

  it('refuses when the AI is not configured', async () => {
    llm.configured = false;

    await expect(service.suggestTopics('u1', {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(llm.generateJson).not.toHaveBeenCalled();
  });

  it('defaults the field to the student department and logs the generation', async () => {
    process.env.AI_INPUT_PRICE_KOBO_PER_MTOK = '1000000';
    process.env.AI_OUTPUT_PRICE_KOBO_PER_MTOK = '1000000';

    llm.generateJson.mockResolvedValue({
      data: {
        topics: [
          { title: '  Smart Attendance System ', description: '  A web app. ' },
          { title: '', description: 'no title, dropped' },
        ],
      },
      inputTokens: 100,
      outputTokens: 40,
    });

    try {
      const result = await service.suggestTopics('u1', {});

      expect(result.field).toBe('Computer Science');
      expect(result.topics).toEqual([
        { title: 'Smart Attendance System', description: 'A web app.' },
      ]);
      expect(prisma.generationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'TOPIC_SUGGESTION', estimatedTokens: 140 }),
      });
      expect(
        prisma.generationLog.create.mock.calls[0][0].data.estimatedCostKobo,
      ).toBeGreaterThan(0);
    } finally {
      delete process.env.AI_INPUT_PRICE_KOBO_PER_MTOK;
      delete process.env.AI_OUTPUT_PRICE_KOBO_PER_MTOK;
    }
  });

  it('uses an explicit field and caps the list at five topics', async () => {
    llm.generateJson.mockResolvedValue({
      data: {
        topics: Array.from({ length: 8 }, (_, i) => ({ title: `Topic ${i}`, description: '' })),
      },
      inputTokens: 10,
      outputTokens: 10,
    });

    const result = await service.suggestTopics('u1', { field: 'Banking & Finance' });

    expect(result.field).toBe('Banking & Finance');
    expect(result.topics).toHaveLength(5);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('reports a bad gateway and logs nothing when no topics come back', async () => {
    llm.generateJson.mockResolvedValue({ data: { topics: [] }, inputTokens: 1, outputTokens: 1 });

    await expect(service.suggestTopics('u1', {})).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.generationLog.create).not.toHaveBeenCalled();
  });
});

describe('ProjectsService chapter status', () => {
  let prisma: any;
  let service: ProjectsService;

  function projectWith(statuses: string[], content = 'drafted content') {
    return {
      id: 'pr1',
      title: 'An App',
      status: 'IN_PROGRESS',
      chapters: statuses.map((status, i) => ({
        id: `c${i + 1}`,
        chapterNumber: i + 1,
        title: `Chapter ${i + 1}`,
        status,
        content,
      })),
    };
  }

  beforeEach(() => {
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue(projectWith(['DRAFT', 'DRAFT'])),
        update: jest.fn().mockResolvedValue({ id: 'pr1', status: 'COMPLETED' }),
      },
      projectChapter: {
        update: jest.fn().mockResolvedValue({ id: 'c1', status: 'REVIEWED' }),
      },
    };
    service = new ProjectsService(prisma, { configured: false } as any);
  });

  it('advances the status of an owned chapter without touching content', async () => {
    const result = await service.updateChapterStatus('u1', 'pr1', 1, 'REVIEWED');

    expect(result.status).toBe('REVIEWED');
    expect(prisma.projectChapter.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'REVIEWED' },
    });
  });

  it('rejects a status change on a chapter with no content', async () => {
    prisma.project.findFirst.mockResolvedValue(projectWith(['DRAFT'], ''));

    await expect(service.updateChapterStatus('u1', 'pr1', 1, 'FINALIZED')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.projectChapter.update).not.toHaveBeenCalled();
  });

  it('rejects a status change on someone else’s project', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.updateChapterStatus('u1', 'not-mine', 1, 'REVIEWED')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a status change once the project is complete', async () => {
    const completed = projectWith(['FINALIZED', 'FINALIZED']);
    completed.status = 'COMPLETED';
    prisma.project.findFirst.mockResolvedValue(completed);

    await expect(service.updateChapterStatus('u1', 'pr1', 1, 'DRAFT')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to complete the project while chapters are unfinished', async () => {
    prisma.project.findFirst.mockResolvedValue(projectWith(['FINALIZED', 'REVIEWED']));

    await expect(service.markComplete('u1', 'pr1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('completes the project once every chapter is finalized', async () => {
    prisma.project.findFirst.mockResolvedValue(projectWith(['FINALIZED', 'FINALIZED']));

    await service.markComplete('u1', 'pr1');

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'pr1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
  });
});
