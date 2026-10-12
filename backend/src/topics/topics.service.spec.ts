import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TopicsService } from './topics.service';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
  });
}

describe('TopicsService', () => {
  let prisma: any;
  let service: TopicsService;

  beforeEach(() => {
    prisma = {
      projectTopic: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TopicsService(prisma);
  });

  it('returns every topic when no filter is given', async () => {
    prisma.projectTopic.findMany.mockResolvedValue([]);

    await service.list();

    const arg = prisma.projectTopic.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
  });

  it('narrows by field and searches the title case-insensitively', async () => {
    prisma.projectTopic.findMany.mockResolvedValue([]);

    await service.list({ field: 'Cybersecurity', q: 'phishing' });

    const arg = prisma.projectTopic.findMany.mock.calls[0][0];
    expect(arg.where.field).toBe('Cybersecurity');
    expect(arg.where.title).toEqual({ contains: 'phishing', mode: 'insensitive' });
  });

  it('collapses the bank to a distinct field list', async () => {
    prisma.projectTopic.findMany.mockResolvedValue([
      { field: 'Computer Science' },
      { field: 'Cybersecurity' },
    ]);

    await expect(service.fields()).resolves.toEqual(['Computer Science', 'Cybersecurity']);

    const arg = prisma.projectTopic.findMany.mock.calls[0][0];
    expect(arg.distinct).toEqual(['field']);
  });

  describe('create', () => {
    it('trims the title, field and description before saving', async () => {
      prisma.projectTopic.create.mockResolvedValue({ id: 't1' });

      await service.create({ title: '  Smart Attendance  ', field: ' CS ', description: '  hi ' });

      expect(prisma.projectTopic.create).toHaveBeenCalledWith({
        data: { title: 'Smart Attendance', field: 'CS', description: 'hi' },
      });
    });

    it('stores a blank description as null', async () => {
      prisma.projectTopic.create.mockResolvedValue({ id: 't1' });

      await service.create({ title: 'Topic', field: 'CS', description: '   ' });

      expect(prisma.projectTopic.create).toHaveBeenCalledWith({
        data: { title: 'Topic', field: 'CS', description: null },
      });
    });

    it('rejects a duplicate title with a 409', async () => {
      prisma.projectTopic.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create({ title: 'Dup', field: 'CS' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('only changes the fields that were provided', async () => {
      prisma.projectTopic.update.mockResolvedValue({ id: 't1' });

      await service.update('t1', { field: 'Cybersecurity' });

      expect(prisma.projectTopic.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { field: 'Cybersecurity' },
      });
    });

    it('maps a missing row to a 404', async () => {
      prisma.projectTopic.update.mockRejectedValue(prismaError('P2025'));

      await expect(service.update('missing', { title: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the row and reports success', async () => {
      prisma.projectTopic.delete.mockResolvedValue({ id: 't1' });

      await expect(service.remove('t1')).resolves.toEqual({ ok: true });
      expect(prisma.projectTopic.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('maps a missing row to a 404', async () => {
      prisma.projectTopic.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
