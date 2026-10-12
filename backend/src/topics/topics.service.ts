import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

export interface ListTopicsParams {
  field?: string;
  q?: string;
}

@Injectable()
export class TopicsService {
  constructor(private prisma: PrismaService) {}

  /** The topic bank, optionally narrowed to a field and/or a title search. */
  list({ field, q }: ListTopicsParams = {}) {
    return this.prisma.projectTopic.findMany({
      where: {
        ...(field ? { field } : {}),
        ...(q ? { title: { contains: q, mode: Prisma.QueryMode.insensitive } } : {}),
      },
      orderBy: [{ field: 'asc' }, { title: 'asc' }],
    });
  }

  /** The distinct fields present in the bank, for the picker's filter. */
  async fields() {
    const rows = await this.prisma.projectTopic.findMany({
      distinct: ['field'],
      select: { field: true },
      orderBy: { field: 'asc' },
    });
    return rows.map((row) => row.field);
  }

  /** Admin: add a topic to the bank. */
  async create(dto: CreateTopicDto) {
    try {
      return await this.prisma.projectTopic.create({
        data: {
          title: dto.title.trim(),
          field: dto.field.trim(),
          description: dto.description?.trim() || null,
        },
      });
    } catch (err) {
      throw this.translate(err, 'A topic with that title already exists');
    }
  }

  /** Admin: edit a topic. Only the provided fields are changed. */
  async update(id: string, dto: UpdateTopicDto) {
    try {
      return await this.prisma.projectTopic.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.field !== undefined ? { field: dto.field.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
        },
      });
    } catch (err) {
      throw this.translate(err, 'A topic with that title already exists');
    }
  }

  /** Admin: remove a topic. Projects keep their own copy of the title. */
  async remove(id: string) {
    try {
      await this.prisma.projectTopic.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      throw this.translate(err, 'A topic with that title already exists');
    }
  }

  /** Turn Prisma's constraint errors into the right HTTP exceptions. */
  private translate(err: unknown, conflict: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return new NotFoundException('Topic not found');
      if (err.code === 'P2002') return new ConflictException(conflict);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
