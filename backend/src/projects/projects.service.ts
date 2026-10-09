import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PurchaseProductType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from '../ai/llm.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateReferenceDto } from './dto/create-reference.dto';
import { CHAPTER_SYSTEM, chapterPrompt } from './chapter.prompt';
import { checkReference } from './reference-verifier';

const CHAPTER_TITLES = [
  'Introduction',
  'Literature Review',
  'Methodology',
  'Implementation & Results',
  'Summary & Conclusion',
];

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
  ) {}

  private async hasPass(userId: string): Promise<boolean> {
    if (process.env.AI_DEV_UNLOCK === 'true') return true;
    // A successful bundle covers the project pass too.
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        userId,
        productType: { in: [PurchaseProductType.PROJECT_PASS, PurchaseProductType.BUNDLE] },
        status: 'SUCCESSFUL',
      },
    });
    return !!purchase;
  }

  async create(userId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        userId,
        title: dto.title,
        supervisorName: dto.supervisorName,
        chapters: {
          create: CHAPTER_TITLES.map((title, i) => ({
            chapterNumber: i + 1,
            title,
            isFreeUnlocked: i === 0, // Chapter 1 only
          })),
        },
      },
      include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
    });
    return project;
  }

  async findMineOrThrow(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /**
   * Drafts one chapter from the student's notes. Chapter 1 is free; the rest
   * need a Project Pass. A completed project must be reopened first.
   */
  async draftChapter(
    userId: string,
    projectId: string,
    chapterNumber: number,
    rawInputText: string,
  ) {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException(
        'AI chapter drafting is not configured. Set ANTHROPIC_API_KEY on the backend.',
      );
    }

    const project = await this.findMineOrThrow(userId, projectId);
    const chapter = project.chapters.find((c) => c.chapterNumber === chapterNumber);
    if (!chapter) throw new NotFoundException('Chapter not found');

    if (project.status === 'COMPLETED') {
      throw new BadRequestException('This project is marked complete — reopen it to make changes.');
    }

    const unlocked = chapter.isFreeUnlocked || (await this.hasPass(userId));
    if (!unlocked) {
      throw new ForbiddenException(
        'This chapter needs the Final Year Project Pass before it can be drafted.',
      );
    }

    const result = await this.llm.generate(
      CHAPTER_SYSTEM,
      chapterPrompt({
        title: project.title,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        rawInputText,
      }),
      6000,
    );

    const updated = await this.prisma.projectChapter.update({
      where: { id: chapter.id },
      data: { rawInputText, content: result.text.trim(), status: 'DRAFT' },
    });

    await this.prisma.generationLog.create({
      data: {
        userId,
        type: 'CHAPTER_DRAFT',
        estimatedTokens: result.inputTokens + result.outputTokens,
      },
    });

    return updated;
  }

  async listReferences(userId: string, projectId: string) {
    await this.findMineOrThrow(userId, projectId);
    return this.prisma.projectReference.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createReference(userId: string, projectId: string, dto: CreateReferenceDto) {
    await this.findMineOrThrow(userId, projectId);
    return this.prisma.projectReference.create({
      data: {
        projectId,
        citationText: dto.citationText.trim(),
        sourceType: dto.sourceType,
        doiOrIsbnOrLink: dto.doiOrIsbnOrLink?.trim() || null,
      },
    });
  }

  async deleteReference(userId: string, projectId: string, referenceId: string) {
    await this.findMineOrThrow(userId, projectId);
    const reference = await this.prisma.projectReference.findFirst({
      where: { id: referenceId, projectId },
    });
    if (!reference) throw new NotFoundException('Reference not found');
    await this.prisma.projectReference.delete({ where: { id: reference.id } });
    return { ok: true };
  }

  /**
   * Checks a reference against free bibliographic APIs. The result is stored on
   * the row so the student (and later, the report) can see how firmly each
   * citation was verified rather than trusting it blindly.
   */
  async verifyReference(userId: string, projectId: string, referenceId: string) {
    await this.findMineOrThrow(userId, projectId);
    const reference = await this.prisma.projectReference.findFirst({
      where: { id: referenceId, projectId },
    });
    if (!reference) throw new NotFoundException('Reference not found');

    const match = await checkReference({
      citationText: reference.citationText,
      doiOrIsbnOrLink: reference.doiOrIsbnOrLink,
      sourceType: reference.sourceType,
    });

    return this.prisma.projectReference.update({
      where: { id: reference.id },
      data: {
        isVerified: match.verified,
        verificationTier: match.tier,
        verifiedVia: match.via,
        formattedCitation: match.formattedCitation ?? reference.formattedCitation,
      },
    });
  }

  /** Student explicitly marks the project complete — chapters go read-only after this. */
  async markComplete(userId: string, projectId: string) {
    const project = await this.findMineOrThrow(userId, projectId);
    return this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  /** Free "Reopen for revisions" — same project, no new charge. */
  async reopen(userId: string, projectId: string) {
    const project = await this.findMineOrThrow(userId, projectId);
    if (project.status !== 'COMPLETED') {
      throw new BadRequestException('Project is not marked complete');
    }
    return this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });
  }
}
