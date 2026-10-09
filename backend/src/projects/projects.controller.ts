import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { DraftChapterDto } from './dto/draft-chapter.dto';
import { CreateReferenceDto } from './dto/create-reference.dto';
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

  @Post(':id/chapters/:chapterNumber/draft')
  draftChapter(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
    @Body() dto: DraftChapterDto,
  ) {
    return this.projectsService.draftChapter(userId, id, chapterNumber, dto.rawInputText);
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
