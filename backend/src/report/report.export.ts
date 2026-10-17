import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  AlignmentType,
  Document,
  FileChild,
  Footer,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';

/** Shape returned by `ReportService.get` — the data an export needs. */
export interface ExportData {
  report: {
    institutionName?: string | null;
    institutionAddress?: string | null;
    faculty?: string | null;
    department?: string | null;
    programme?: string | null;
    level?: string | null;
    matricNumber?: string | null;
    schoolSupervisor?: string | null;
    companySupervisor?: string | null;
    durationLabel?: string | null;
    submissionDate?: string | null;
    logoUrl?: string | null;
    coverImageUrl?: string | null;
  };
  sections: {
    kind: string;
    title: string;
    chapter: number | null;
    content: string | null;
  }[];
  defaults: {
    fullName: string;
    school: string;
    department: string;
    companyName: string;
    companyAddress: string;
    startDate: string | null;
    endDate: string | null;
    projectTitle: string | null;
  };
}

const TITLE = 'STUDENT INDUSTRIAL WORK EXPERIENCE SCHEME (SIWES)';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Turns `{fullName}` etc into values, leaving unknown placeholders empty. */
function paragraphsHtml(text: string | null): string {
  if (!text?.trim()) return '<p class="muted">Not written yet.</p>';
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/** Reads an uploaded image from disk into a data URL for embedding. */
async function toDataUrl(publicUrl?: string | null): Promise<string | null> {
  if (!publicUrl) return null;
  try {
    const abs = join(process.cwd(), publicUrl);
    const buf = await readFile(abs);
    return `data:${mimeFor(abs)};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function imageBuffer(publicUrl?: string | null): Promise<Buffer | null> {
  if (!publicUrl) return null;
  try {
    return await readFile(join(process.cwd(), publicUrl));
  } catch {
    return null;
  }
}

type ImgType = 'png' | 'jpg' | 'gif' | 'bmp';

function imageTypeFor(path: string): ImgType {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.gif') return 'gif';
  if (ext === '.bmp') return 'bmp';
  return 'jpg';
}

/** Reads an uploaded image and builds a docx ImageRun sized for the page. */
async function docxImage(
  publicUrl: string | null | undefined,
  width: number,
  height: number,
): Promise<ImageRun | null> {
  const buf = await imageBuffer(publicUrl);
  if (!buf) return null;
  return new ImageRun({
    type: imageTypeFor(publicUrl as string),
    data: buf,
    transformation: { width, height },
  });
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function display(value?: string | null, fallback = '—'): string {
  return value?.trim() ? value.trim() : fallback;
}

// ---------------------------------------------------------------------------
// HTML (for the PDF)
// ---------------------------------------------------------------------------

export async function renderReportHtml(data: ExportData): Promise<string> {
  const { report, sections, defaults } = data;
  const logo = await toDataUrl(report.logoUrl);
  const cover = await toDataUrl(report.coverImageUrl);

  const durationWord = report.durationLabel || '';
  const headingUnderLogo = `${durationWord ? durationWord + ' ' : ''}REPORT ON THE ${TITLE}`;

  const chapters = sections.filter((s) => s.chapter !== null);
  const front = sections.filter((s) => s.chapter === null);
  const byKind = (k: string) => sections.find((s) => s.kind === k);

  // --- Cover page ---
  const coverPage = cover
    ? `<section class="page"><img class="full-page" src="${cover}" alt="Cover"/></section>`
    : `<section class="page cover">
        ${logo ? `<img class="logo" src="${logo}" alt="Logo"/>` : ''}
        <h1 class="inst-name">${esc(display(report.institutionName, defaults.school))}</h1>
        <p class="inst-addr">${esc(display(report.institutionAddress))}</p>
        <p class="inst-dept">DEPARTMENT OF ${esc(display(report.department, defaults.department).toUpperCase())}</p>
        <div class="spacer"></div>
        <p class="cover-kicker">${esc(headingUnderLogo)}</p>
        <p class="cover-sub">${esc(report.programme || '')}</p>
        <div class="spacer"></div>
        <p class="cover-by">BY</p>
        <p class="cover-name">${esc(defaults.fullName.toUpperCase())}</p>
        ${report.matricNumber ? `<p class="cover-matric">MATRIC NO: ${esc(report.matricNumber)}</p>` : ''}
        <div class="spacer"></div>
        <p class="cover-date">${esc(fmt(report.submissionDate))}</p>
      </section>`;

  // --- Title page ---
  const titlePage = `<section class="page title-page">
      <p class="tp-title">${esc(headingUnderLogo)}</p>
      <div class="spacer"></div>
      <p class="tp-submitted">A REPORT SUBMITTED TO THE DEPARTMENT OF ${esc(
        display(report.department, defaults.department).toUpperCase(),
      )}${report.faculty ? `, FACULTY OF ${esc(report.faculty.toUpperCase())}` : ''}, ${esc(
        display(report.institutionName, defaults.school).toUpperCase(),
      )}</p>
      <div class="spacer"></div>
      <p class="cover-by">BY</p>
      <p class="cover-name">${esc(defaults.fullName.toUpperCase())}</p>
      ${report.matricNumber ? `<p class="cover-matric">${esc(report.matricNumber)}</p>` : ''}
      <div class="spacer"></div>
      <p class="tp-programme">IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF ${esc(
        (report.programme || '').toUpperCase(),
      )}</p>
      <div class="spacer"></div>
      <table class="signatures">
        <tr><td>${esc(display(report.schoolSupervisor))}</td><td>${esc(display(report.companySupervisor))}</td></tr>
        <tr><td class="sig-line">School Supervisor</td><td class="sig-line">Industry Supervisor</td></tr>
      </table>
      <div class="spacer"></div>
      <p class="cover-date">${esc(fmt(report.submissionDate))}</p>
    </section>`;

  // --- Table of contents ---
  const tocItems = [
    byKind('ABSTRACT') ? 'Abstract' : null,
    byKind('DEDICATION') ? 'Dedication' : null,
    byKind('ACKNOWLEDGMENT') ? 'Acknowledgment' : null,
    ...chapters.map((c) => `Chapter ${c.chapter}: ${c.title}`),
  ].filter((x): x is string => !!x);

  const toc = `<section class="page">
      <h2 class="center">TABLE OF CONTENTS</h2>
      <ul class="toc">${tocItems.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>`;

  // --- Front matter + chapters ---
  const body = sections
    .map((s) => {
      const heading =
        s.chapter !== null
          ? `CHAPTER ${s.chapter}: ${s.title.toUpperCase()}`
          : s.title.toUpperCase();
      return `<section class="page">
        <h2 class="${s.chapter !== null ? 'chapter-title' : 'center'}">${esc(heading)}</h2>
        <div class="prose">${paragraphsHtml(s.content)}</div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>SIWES Report</title>
<style>
  @page { size: A4; margin: 25mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111; font-size: 12pt; line-height: 1.6; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .spacer { height: 40px; }
  .center, .cover, .title-page { text-align: center; }
  .cover .logo { max-height: 110px; max-width: 60%; object-fit: contain; margin-bottom: 12px; }
  .full-page { display: block; width: 100%; height: auto; }
  .inst-name { font-size: 18pt; font-weight: bold; text-transform: uppercase; margin: 6px 0; }
  .inst-addr, .inst-dept { margin: 2px 0; }
  .inst-dept { font-weight: bold; }
  .cover-kicker { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 12px 0; }
  .cover-sub, .cover-by, .cover-matric { margin: 4px 0; }
  .cover-name { font-size: 15pt; font-weight: bold; margin: 6px 0; }
  .cover-by { letter-spacing: 2px; }
  .tp-title { font-size: 15pt; font-weight: bold; text-transform: uppercase; }
  .tp-submitted, .tp-programme { font-size: 11.5pt; text-transform: uppercase; }
  .signatures { width: 80%; margin: 0 auto; border-collapse: collapse; }
  .signatures td { padding: 24px 10px 4px; text-align: center; }
  .sig-line { border-top: 1px solid #333; font-size: 10pt; }
  h2 { font-size: 14pt; text-transform: uppercase; margin: 0 0 18px; }
  .chapter-title { text-align: left; }
  .prose p { margin: 0 0 12px; text-align: justify; }
  .muted { color: #777; font-style: italic; }
  .toc { list-style: none; padding: 0; }
  .toc li { padding: 6px 0; border-bottom: 1px dotted #bbb; }
</style></head>
<body>
  ${coverPage}
  ${titlePage}
  ${front
    .map(
      (s) => `<section class="page">
        <h2 class="center">${esc(s.title.toUpperCase())}</h2>
        <div class="prose">${paragraphsHtml(s.content)}</div>
      </section>`,
    )
    .join('\n')}
  ${toc}
  ${body}
</body></html>`;
}

export async function renderPdf(data: ExportData): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const html = await renderReportHtml(data);
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

function para(text: string, opts: { align?: Align; bold?: boolean; size?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 160, line: 360 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 24 })],
  });
}

function heading(text: string, align: Align = AlignmentType.CENTER) {
  return new Paragraph({
    alignment: align,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
    children: [new TextRun({ text, bold: true, size: 28 })],
  });
}

function bodyParagraphs(text: string | null): Paragraph[] {
  if (!text?.trim()) return [new Paragraph({ children: [new TextRun({ text: 'Not written yet.', italics: true })] })];
  return text
    .split(/\n{2,}/)
    .map(
      (p) =>
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 160, line: 360 },
          children: [new TextRun({ text: p.trim(), size: 24 })],
        }),
    );
}

export async function renderDocx(data: ExportData): Promise<Buffer> {
  const { report, sections, defaults } = data;
  const logo = await docxImage(report.logoUrl, 120, 120);
  const cover = await docxImage(report.coverImageUrl, 480, 660);
  const durationWord = report.durationLabel || '';
  const headingText = `${durationWord ? durationWord + ' ' : ''}REPORT ON THE ${TITLE}`;

  const children: FileChild[] = [];

  // Cover page: use the uploaded image if the student supplied one, else build it.
  if (cover) {
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [cover] }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  } else {
    if (logo) {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logo] }));
    }
    children.push(
      para(display(report.institutionName, defaults.school).toUpperCase(), {
        align: AlignmentType.CENTER,
        bold: true,
        size: 34,
      }),
      para(display(report.institutionAddress, ''), { align: AlignmentType.CENTER }),
      para(`DEPARTMENT OF ${display(report.department, defaults.department).toUpperCase()}`, {
        align: AlignmentType.CENTER,
        bold: true,
      }),
      new Paragraph({ spacing: { before: 400 } }),
      para(headingText, { align: AlignmentType.CENTER, bold: true, size: 30 }),
      new Paragraph({ spacing: { before: 400 } }),
      para('BY', { align: AlignmentType.CENTER, bold: true }),
      para(defaults.fullName.toUpperCase(), { align: AlignmentType.CENTER, bold: true, size: 30 }),
    );
    if (report.matricNumber) {
      children.push(para(`MATRIC NO: ${report.matricNumber}`, { align: AlignmentType.CENTER }));
    }
    children.push(
      new Paragraph({ spacing: { before: 400 } }),
      para(fmt(report.submissionDate), { align: AlignmentType.CENTER }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  // Title page.
  children.push(
    heading(headingText),
    para(
      `A REPORT SUBMITTED TO THE DEPARTMENT OF ${display(
        report.department,
        defaults.department,
      ).toUpperCase()}${report.faculty ? `, FACULTY OF ${report.faculty.toUpperCase()}` : ''}, ${display(
        report.institutionName,
        defaults.school,
      ).toUpperCase()}`,
      { align: AlignmentType.CENTER },
    ),
    new Paragraph({ spacing: { before: 240 } }),
    para('BY', { align: AlignmentType.CENTER, bold: true }),
    para(defaults.fullName.toUpperCase(), { align: AlignmentType.CENTER, bold: true, size: 30 }),
  );
  if (report.matricNumber) {
    children.push(para(report.matricNumber, { align: AlignmentType.CENTER }));
  }
  children.push(
    new Paragraph({ spacing: { before: 240 } }),
    para(
      `IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF ${(report.programme || '').toUpperCase()}`,
      { align: AlignmentType.CENTER },
    ),
    new Paragraph({ spacing: { before: 300 } }),
    para(`School Supervisor: ${display(report.schoolSupervisor, '')}`, { align: AlignmentType.CENTER }),
    para(`Industry Supervisor: ${display(report.companySupervisor, '')}`, { align: AlignmentType.CENTER }),
    new Paragraph({ spacing: { before: 240 } }),
    para(fmt(report.submissionDate), { align: AlignmentType.CENTER }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Front matter.
  for (const s of sections.filter((x) => x.chapter === null)) {
    children.push(heading(s.title.toUpperCase()), ...bodyParagraphs(s.content));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Table of contents (Word fills the page numbers on open).
  children.push(
    heading('TABLE OF CONTENTS'),
    new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Chapters.
  for (const s of sections.filter((x) => x.chapter !== null)) {
    children.push(
      heading(`CHAPTER ${s.chapter}: ${s.title.toUpperCase()}`, AlignmentType.LEFT),
      ...bodyParagraphs(s.content),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 } },
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
