import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { DraftChapterDto } from './dto/draft-chapter.dto';
import { RegenerateChapterDto } from './dto/regenerate-chapter.dto';
import { UpdateChapterStatusDto } from './dto/update-chapter-status.dto';
import { CreateReferenceDto } from './dto/create-reference.dto';
import { SuggestTopicsDto } from './dto/suggest-topics.dto';
import { PrismaService } from '../common/prisma.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private prisma: PrismaService,
  ) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(userId, dto);
  }

  // A paid model call, so it carries the same per-account cap as the other AI
  // routes. It is a static path, so it never collides with the `:id` routes.
  @Post('suggest-topics')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(VerifiedEmailGuard, AiThrottlerGuard)
  suggestTopics(@CurrentUserId() userId: string, @Body() dto: SuggestTopicsDto) {
    return this.projectsService.suggestTopics(userId, dto);
  }

  @Get()
  findMine(@CurrentUserId() userId: string) {
    return this.prisma.project.findMany({
      where: { userId },
      include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
    });
  }

  @Get(':id')
  findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.projectsService.findMineOrThrow(userId, id);
  }

  // AI-backed routes: capped below the global limit since each one costs a
  // paid model call. The verified-email guard runs first, so a refused request
  // never costs a rate-limit slot.
  @Post(':id/chapters/:chapterNumber/draft')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(VerifiedEmailGuard, AiThrottlerGuard)
  draftChapter(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
    @Body() dto: DraftChapterDto,
  ) {
    return this.projectsService.draftChapter(userId, id, chapterNumber, dto.rawInputText);
  }

  @Post(':id/chapters/:chapterNumber/regenerate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(VerifiedEmailGuard, AiThrottlerGuard)
  regenerateChapter(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
    @Body() dto: RegenerateChapterDto,
  ) {
    return this.projectsService.regenerateChapter(userId, id, chapterNumber, dto.rawInputText);
  }

  // A plain status write (Draft → Reviewed → Finalized), no model call, so it
  // carries no AI throttle.
  @Patch(':id/chapters/:chapterNumber')
  updateChapterStatus(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
    @Body() dto: UpdateChapterStatusDto,
  ) {
    return this.projectsService.updateChapterStatus(userId, id, chapterNumber, dto.status);
  }

  @Get(':id/references')
  listReferences(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.projectsService.listReferences(userId, id);
  }

  @Post(':id/references')
  createReference(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CreateReferenceDto,
  ) {
    return this.projectsService.createReference(userId, id, dto);
  }

  @Delete(':id/references/:referenceId')
  deleteReference(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.projectsService.deleteReference(userId, id, referenceId);
  }

  @Post(':id/references/:referenceId/verify')
  verifyReference(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.projectsService.verifyReference(userId, id, referenceId);
  }

  @Post(':id/mark-complete')
  markComplete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.projectsService.markComplete(userId, id);
  }

  @Post(':id/reopen')
  reopen(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.projectsService.reopen(userId, id);
  }
}
