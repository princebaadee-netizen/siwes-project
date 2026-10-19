import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReportSectionKind } from '@prisma/client';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from '../ai/llm.service';
import { estimateCostKobo } from '../ai/token-cost';
import { isAdminEmailFromEnv } from '../auth/admin';
import { REPORT_SECTIONS, REPORT_SECTION_KINDS, sectionMeta } from './report.sections';
import { REPORT_SYSTEM, ReportContext, reportSectionPrompt } from './report.prompt';
import { ExportData, renderDocx, renderPdf } from './report.export';
import { UpdateReportDto } from './dto/update-report.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

/**
 * One section is a page or two of prose — well under 2000 tokens. The free
 * Groq tier allows only 8000 tokens per minute across prompt *and* completion,
 * so asking for 4000 left room for about one call a minute and every call after
 * the first came back 429, stretching generation past what the request could
 * tolerate. Report sections are written by the client one at a time.
 */
const SECTION_MAX_TOKENS = 2000;

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

@Injectable()
export class ReportService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
  ) {}

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  /**
   * The report belongs to the IT/SIWES side of the app, so writing it is
   * unlocked by the same IT/SIWES Pass that unlocks the logbook AI (with the
   * usual admin / dev bypass). Reading and editing cover details stays free.
   */
  private async hasItPass(userId: string): Promise<boolean> {
    if (process.env.AI_DEV_UNLOCK === 'true') return true;
    if (await this.isAdminUser(userId)) return true;
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        userId,
        productType: { in: ['IT_SIWES_PASS', 'BUNDLE'] },
        status: 'SUCCESSFUL',
      },
    });
    return !!purchase;
  }

  private async isAdminUser(userId: string): Promise<boolean> {
    if (!process.env.ADMIN_EMAILS?.trim()) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return isAdminEmailFromEnv(user?.email);
  }

  private maxRegenerations(): number {
    const raw = Number(process.env.AI_MAX_REGENERATIONS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 3;
  }

  // ---------------------------------------------------------------------------
  // Read / create
  // ---------------------------------------------------------------------------

  /** Lazily creates the one report a student is allowed, with empty sections. */
  private async ensureReport(userId: string) {
    const existing = await this.prisma.siwesReport.findUnique({
      where: { userId },
      include: { sections: true },
    });
    if (existing) {
      return this.fillMissingSections(existing);
    }

    const placement = await this.prisma.iTPlacement.findUnique({ where: { userId } });
    const durationLabel =
      placement ? durationBetween(placement.startDate, placement.endDate) : null;

    return this.prisma.siwesReport.create({
      data: {
        userId,
        durationLabel,
        sections: {
          create: REPORT_SECTION_KINDS.map((kind) => ({ kind })),
        },
      },
      include: { sections: true },
    });
  }

  /** Adds rows for any section kind introduced after this report was created. */
  private async fillMissingSections(report: {
    id: string;
    sections: { kind: ReportSectionKind }[];
  }) {
    const present = new Set(report.sections.map((s) => s.kind));
    const missing = REPORT_SECTION_KINDS.filter((k) => !present.has(k));
    if (missing.length === 0) {
      return this.prisma.siwesReport.findUniqueOrThrow({
        where: { id: report.id },
        include: { sections: true },
      });
    }
    await this.prisma.siwesReportSection.createMany({
      data: missing.map((kind) => ({ reportId: report.id, kind })),
    });
    return this.prisma.siwesReport.findUniqueOrThrow({
      where: { id: report.id },
      include: { sections: true },
    });
  }

  async get(userId: string) {
    const report = await this.ensureReport(userId);
    const [user, placement, entries, project, canGenerate] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, school: true, department: true },
      }),
      this.prisma.iTPlacement.findUnique({ where: { userId } }),
      this.prisma.logbookEntry.findMany({
        where: { calendarDay: { placement: { userId } } },
        include: { calendarDay: true },
        orderBy: { calendarDay: { date: 'asc' } },
      }),
      this.prisma.project.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { title: true },
      }),
      this.hasItPass(userId),
    ]);

    return {
      report: this.viewReport(report),
      sections: this.viewSections(report.sections),
      canGenerate,
      logbookCount: entries.length,
      defaults: {
        fullName: user?.fullName ?? '',
        school: user?.school ?? '',
        department: user?.department ?? '',
        companyName: placement?.companyName ?? '',
        companyAddress: placement?.companyAddress ?? '',
        industrySector: placement?.industrySector ?? '',
        startDate: placement?.startDate ?? null,
        endDate: placement?.endDate ?? null,
        durationLabel: report.durationLabel ?? null,
        projectTitle: project?.title ?? null,
      },
    };
  }

  /** Strips the relation and orders sections to match the document. */
  private viewReport(report: any) {
    const { sections, ...rest } = report;
    return rest;
  }

  private viewSections(sections: any[]) {
    const byKind = new Map(sections.map((s) => [s.kind, s]));
    return REPORT_SECTIONS.map((meta) => {
      const row = byKind.get(meta.kind);
      return {
        kind: meta.kind,
        title: meta.title,
        chapter: meta.chapter,
        content: row?.content ?? null,
        status: row?.status ?? 'DRAFT',
        regenerationsUsed: row?.regenerationsUsed ?? 0,
      };
    });
  }

  /** Decorates a single section row, for responses about one section. */
  private viewSection(row: any) {
    const meta = sectionMeta(row.kind);
    return {
      kind: meta.kind,
      title: meta.title,
      chapter: meta.chapter,
      content: row.content ?? null,
      status: row.status ?? 'DRAFT',
      regenerationsUsed: row.regenerationsUsed ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Edits
  // ---------------------------------------------------------------------------

  /** A completed report is read-only until the student reopens it. */
  private assertEditable(report: { status: string }) {
    if (report.status === 'COMPLETED') {
      throw new BadRequestException('This report is marked complete — reopen it to make changes.');
    }
  }

  async update(userId: string, dto: UpdateReportDto) {
    const report = await this.ensureReport(userId);
    this.assertEditable(report);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      data[key] = key === 'submissionDate' && value ? new Date(value as string) : value;
    }
    // Keep the derived duration if the student clears it and a placement exists.
    if (!data.durationLabel && Object.prototype.hasOwnProperty.call(dto, 'durationLabel')) {
      delete data.durationLabel;
    }
    const updated = await this.prisma.siwesReport.update({
      where: { id: report.id },
      data,
      include: { sections: true },
    });
    return { report: this.viewReport(updated), sections: this.viewSections(updated.sections) };
  }

  async updateSection(userId: string, kind: ReportSectionKind, dto: UpdateSectionDto) {
    const report = await this.ensureReport(userId);
    this.assertEditable(report);
    const section = await this.prisma.siwesReportSection.upsert({
      where: { reportId_kind: { reportId: report.id, kind } },
      create: {
        reportId: report.id,
        kind,
        content: dto.content ?? null,
        status: dto.status ?? 'DRAFT',
      },
      update: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.viewSection(section);
  }

  // ---------------------------------------------------------------------------
  // Completion
  // ---------------------------------------------------------------------------

  /**
   * Student marks the report done — read-only from here, same workflow as the
   * project's mark-complete. Every section must have content and be FINALIZED.
   */
  async markComplete(userId: string) {
    const report = await this.ensureReport(userId);

    const remaining = report.sections.filter(
      (s) => !s.content?.trim() || s.status !== 'FINALIZED',
    ).length;
    if (remaining > 0) {
      throw new BadRequestException(
        `Finalize every section before marking the report complete — ${remaining} still ${
          remaining === 1 ? 'needs' : 'need'
        } attention.`,
      );
    }

    const updated = await this.prisma.siwesReport.update({
      where: { id: report.id },
      data: { status: 'COMPLETED' },
      include: { sections: true },
    });
    return { report: this.viewReport(updated), sections: this.viewSections(updated.sections) };
  }

  /** Free "Reopen for revisions" — same report, no new charge. */
  async reopen(userId: string) {
    const report = await this.ensureReport(userId);
    if (report.status !== 'COMPLETED') {
      throw new BadRequestException('Report is not marked complete');
    }

    const updated = await this.prisma.siwesReport.update({
      where: { id: report.id },
      data: { status: 'DRAFT' },
      include: { sections: true },
    });
    return { report: this.viewReport(updated), sections: this.viewSections(updated.sections) };
  }

  // ---------------------------------------------------------------------------
  // AI generation
  // ---------------------------------------------------------------------------

  async generateSection(userId: string, kind: ReportSectionKind, notes?: string) {
    return this.writeSection(userId, kind, notes, false);
  }

  async regenerateSection(userId: string, kind: ReportSectionKind, notes?: string) {
    return this.writeSection(userId, kind, notes, true);
  }

  private async writeSection(
    userId: string,
    kind: ReportSectionKind,
    notes: string | undefined,
    isRegeneration: boolean,
  ) {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException(
        'AI report writing is not configured. Set GROQ_API_KEY on the backend.',
      );
    }

    const report = await this.ensureReport(userId);
    this.assertEditable(report);
    const section = report.sections.find((s) => s.kind === kind);

    if (isRegeneration && section) {
      if (section.regenerationsUsed >= this.maxRegenerations() && !(await this.isAdminUser(userId))) {
        throw new ForbiddenException(
          `This section has reached its limit of ${this.maxRegenerations()} regenerations.`,
        );
      }
    }

    if (!(await this.hasItPass(userId))) {
      throw new ForbiddenException(
        'Writing the IT report needs the IT/SIWES Pass. Buy it to unlock your report.',
      );
    }

    const ctx = await this.buildContext(userId, report);
    const meta = sectionMeta(kind);

    const result = await this.llm.generate(
      REPORT_SYSTEM,
      reportSectionPrompt(meta, ctx) +
        (notes ? `\n\nAdditional guidance from the student: ${notes}` : ''),
      SECTION_MAX_TOKENS,
    );

    const saved = await this.prisma.siwesReportSection.upsert({
      where: { reportId_kind: { reportId: report.id, kind } },
      create: { reportId: report.id, kind, content: result.text.trim() },
      update: {
        content: result.text.trim(),
        ...(isRegeneration ? { regenerationsUsed: { increment: 1 } } : {}),
      },
    });

    await this.prisma.generationLog.create({
      data: {
        userId,
        type: 'REPORT_SECTION',
        estimatedTokens: result.inputTokens + result.outputTokens,
        estimatedCostKobo: estimateCostKobo(result.inputTokens, result.outputTokens),
      },
    });

    return this.viewSection(saved);
  }

  /** Generates every section that has no content yet, in document order. */
  async generateAll(userId: string) {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException(
        'AI report writing is not configured. Set GROQ_API_KEY on the backend.',
      );
    }
    if (!(await this.hasItPass(userId))) {
      throw new ForbiddenException(
        'Writing the IT report needs the IT/SIWES Pass. Buy it to unlock your report.',
      );
    }

    const report = await this.ensureReport(userId);
    this.assertEditable(report);
    const order = new Map(REPORT_SECTION_KINDS.map((k, i) => [k, i]));
    const pending = report.sections
      .filter((s) => !s.content?.trim())
      .sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));

    const generated: ReportSectionKind[] = [];
    const failed: ReportSectionKind[] = [];
    for (const section of pending) {
      try {
        await this.writeSection(userId, section.kind, undefined, false);
        generated.push(section.kind);
      } catch {
        // Keep going: one bad section must not discard the rest of the report.
        failed.push(section.kind);
      }
    }

    return this.get(userId).then((view) => ({ ...view, generated, failed }));
  }

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  private async buildContext(userId: string, report: any): Promise<ReportContext> {
    const [user, placement, entries, project] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, school: true, department: true },
      }),
      this.prisma.iTPlacement.findUnique({ where: { userId } }),
      this.prisma.logbookEntry.findMany({
        where: { calendarDay: { placement: { userId } } },
        include: { calendarDay: true },
        orderBy: { calendarDay: { date: 'asc' } },
      }),
      this.prisma.project.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { title: true },
      }),
    ]);

    return {
      studentName: user?.fullName ?? 'the student',
      institutionName: report.institutionName ?? user?.school ?? null,
      institutionAddress: report.institutionAddress ?? null,
      faculty: report.faculty ?? null,
      department: report.department ?? user?.department ?? null,
      programme: report.programme ?? null,
      level: report.level ?? null,
      companyName: placement?.companyName ?? null,
      companyAddress: placement?.companyAddress ?? null,
      industrySector: placement?.industrySector ?? null,
      startDate: placement ? formatDate(placement.startDate) : null,
      endDate: placement ? formatDate(placement.endDate) : null,
      durationLabel:
        report.durationLabel ??
        (placement ? durationBetween(placement.startDate, placement.endDate) : null),
      dedicationNames: report.dedicationNames ?? [],
      projectTitle: project?.title ?? null,
      entries: entries.map((e) => ({
        date: formatDate(e.calendarDay.date),
        activity: e.activity,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  private async exportData(userId: string): Promise<ExportData> {
    const view = await this.get(userId);
    return {
      report: view.report,
      sections: view.sections,
      defaults: view.defaults,
    } as ExportData;
  }

  async exportPdf(userId: string): Promise<Buffer> {
    return renderPdf(await this.exportData(userId));
  }

  async exportDocx(userId: string): Promise<Buffer> {
    return renderDocx(await this.exportData(userId));
  }

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  /**
   * Saves an uploaded logo or a ready-made cover/front-page image to disk and
   * records its public path on the report. Files are namespaced by user so one
   * student can never overwrite another's.
   */
  async attachImage(userId: string, field: 'logoUrl' | 'coverImageUrl', file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image was uploaded.');
    if (!/^image\//.test(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed.');
    }

    const report = await this.ensureReport(userId);
    this.assertEditable(report);
    const ext = extensionFor(file.mimetype);
    const dir = join(process.cwd(), 'uploads', 'report', userId);
    await mkdir(dir, { recursive: true });
    const filename = `${field === 'logoUrl' ? 'logo' : 'cover'}-${Date.now()}.${ext}`;
    await writeFile(join(dir, filename), file.buffer);

    const url = `/uploads/report/${userId}/${filename}`;
    const updated = await this.prisma.siwesReport.update({
      where: { id: report.id },
      data: { [field]: url },
      include: { sections: true },
    });
    return { report: this.viewReport(updated), sections: this.viewSections(updated.sections) };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Rough month count between two dates, as a words label ("Six Months"). */
export function durationBetween(start: Date, end: Date): string {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 0 : -1) +
    1;
  const clamped = Math.max(1, months);
  const label = NUMBER_WORDS[clamped] ?? String(clamped);
  return `${label} Month${clamped === 1 ? '' : 's'}`;
}

function extensionFor(mimetype: string): string {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  if (mimetype === 'image/gif') return 'gif';
  return 'jpg';
}
