import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  PipeTransform,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ReportSectionKind } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ReportService } from './report.service';
import { UpdateReportDto } from './dto/update-report.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { GenerateSectionDto } from './dto/generate-section.dto';
import { REPORT_SECTION_KINDS } from './report.sections';

/** Validates the :kind path segment against the known report sections. */
class ReportSectionKindPipe implements PipeTransform {
  transform(value: string): ReportSectionKind {
    const upper = value.toUpperCase();
    if (!REPORT_SECTION_KINDS.includes(upper as ReportSectionKind)) {
      throw new BadRequestException(`Unknown report section "${value}".`);
    }
    return upper as ReportSectionKind;
  }
}

const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
};

@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private reportService: ReportService) {}

  @Get()
  get(@CurrentUserId() userId: string) {
    return this.reportService.get(userId);
  }

  @Patch()
  update(@CurrentUserId() userId: string, @Body() dto: UpdateReportDto) {
    return this.reportService.update(userId, dto);
  }

  @Patch('sections/:kind')
  updateSection(
    @CurrentUserId() userId: string,
    @Param('kind', ReportSectionKindPipe) kind: ReportSectionKind,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.reportService.updateSection(userId, kind, dto);
  }

  @Post('sections/:kind/generate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AiThrottlerGuard)
  generateSection(
    @CurrentUserId() userId: string,
    @Param('kind', ReportSectionKindPipe) kind: ReportSectionKind,
    @Body() dto: GenerateSectionDto,
  ) {
    return this.reportService.generateSection(userId, kind, dto.notes);
  }

  @Post('sections/:kind/regenerate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AiThrottlerGuard)
  regenerateSection(
    @CurrentUserId() userId: string,
    @Param('kind', ReportSectionKindPipe) kind: ReportSectionKind,
    @Body() dto: GenerateSectionDto,
  ) {
    return this.reportService.regenerateSection(userId, kind, dto.notes);
  }

  @Post('generate-all')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AiThrottlerGuard)
  generateAll(@CurrentUserId() userId: string) {
    return this.reportService.generateAll(userId);
  }

  @Post('mark-complete')
  markComplete(@CurrentUserId() userId: string) {
    return this.reportService.markComplete(userId);
  }

  @Post('reopen')
  reopen(@CurrentUserId() userId: string) {
    return this.reportService.reopen(userId);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadLogo(@CurrentUserId() userId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.reportService.attachImage(userId, 'logoUrl', file);
  }

  @Post('cover-image')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadCover(@CurrentUserId() userId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.reportService.attachImage(userId, 'coverImageUrl', file);
  }

  @Get('export.pdf')
  async exportPdf(@CurrentUserId() userId: string, @Res() res: Response) {
    const pdf = await this.reportService.exportPdf(userId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="siwes-report.pdf"',
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  @Get('export.docx')
  async exportDocx(@CurrentUserId() userId: string, @Res() res: Response) {
    const docx = await this.reportService.exportDocx(userId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="siwes-report.docx"',
      'Content-Length': String(docx.length),
    });
    res.end(docx);
  }
}
