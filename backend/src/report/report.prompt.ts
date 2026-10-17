import { ReportSectionMeta } from './report.sections';

export const REPORT_SYSTEM =
  'You write the sections of a Nigerian university SIWES (Student Industrial Work ' +
  'Experience Scheme) report on behalf of the student. Use formal, academic English in ' +
  'the past tense and first person ("I") where it reads naturally. Write real prose in ' +
  'paragraphs — never bullet points, numbered lists, markdown, headings or code fences. ' +
  'Base everything strictly on the facts supplied: the student, the organisation and the ' +
  'logbook of what was done. Do not invent certificates, awards, salaries, tools, ' +
  'colleagues or results that were not mentioned. If a detail is genuinely unknown, leave ' +
  'it out rather than making it up. Return only the text of the section.';

export interface ReportContext {
  studentName: string;
  institutionName?: string | null;
  institutionAddress?: string | null;
  faculty?: string | null;
  department?: string | null;
  programme?: string | null;
  level?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  industrySector?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationLabel?: string | null;
  dedicationNames?: string[];
  projectTitle?: string | null;
  /** The logbook, oldest first. */
  entries: { date: string; activity: string }[];
}

/**
 * How many logbook lines go into one prompt. Everything the request sends counts
 * against the free tier's 8000 tokens per minute, so a full placement (400
 * entries) would push the prompt over the limit on its own and the call would be
 * rejected before any text was written. 100 entries still spans months of work
 * while leaving the budget for the section itself.
 */
const MAX_ENTRIES = 100;

function contextBlock(ctx: ReportContext): string {
  const lines: string[] = [
    'STUDENT AND PLACEMENT',
    `- Student: ${ctx.studentName}`,
    ctx.institutionName ? `- Institution: ${ctx.institutionName}` : null,
    ctx.institutionAddress ? `- Institution address: ${ctx.institutionAddress}` : null,
    ctx.faculty ? `- Faculty: ${ctx.faculty}` : null,
    ctx.department ? `- Department: ${ctx.department}` : null,
    ctx.programme ? `- Programme: ${ctx.programme}` : null,
    ctx.level ? `- Level: ${ctx.level}` : null,
    ctx.companyName ? `- Placement organisation: ${ctx.companyName}` : null,
    ctx.companyAddress ? `- Organisation address: ${ctx.companyAddress}` : null,
    ctx.industrySector ? `- Industry sector: ${ctx.industrySector}` : null,
    ctx.startDate && ctx.endDate
      ? `- Period: ${ctx.startDate} to ${ctx.endDate} (${ctx.durationLabel ?? 'the placement'})`
      : null,
    ctx.projectTitle ? `- Final year project: ${ctx.projectTitle}` : null,
    (ctx.dedicationNames ?? []).length
      ? `- People to name in the dedication/acknowledgment: ${(ctx.dedicationNames ?? []).join(', ')}`
      : null,
  ].filter((l): l is string => l !== null);

  const entries = ctx.entries.slice(0, MAX_ENTRIES);
  const logbookLines = [
    '',
    `LOGBOOK (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, oldest first)`,
    ...entries.map((e) => `- ${e.date}: ${e.activity}`),
  ];

  return [...lines, ...logbookLines].join('\n');
}

export function reportSectionPrompt(meta: ReportSectionMeta, ctx: ReportContext): string {
  return [
    `Write the "${meta.title}" ${
      meta.chapter ? `(Chapter ${meta.chapter}) ` : ''
    }section of the SIWES report.`,
    '',
    `What this section must contain: ${meta.brief}`,
    '',
    contextBlock(ctx),
  ].join('\n');
}
