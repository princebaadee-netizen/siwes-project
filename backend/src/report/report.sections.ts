import { ReportSectionKind } from '@prisma/client';

export interface ReportSectionMeta {
  kind: ReportSectionKind;
  /** Heading shown for the section in the report and table of contents. */
  title: string;
  /** Chapter number, or null for the front-matter sections (abstract, etc). */
  chapter: number | null;
  /** One-line blurb used to build the AI prompt for this section. */
  brief: string;
}

/**
 * The single source of truth for the report's shape. The order here is the
 * order sections appear in the document, the table of contents and the editor.
 */
export const REPORT_SECTIONS: ReportSectionMeta[] = [
  {
    kind: 'ABSTRACT',
    title: 'Abstract',
    chapter: null,
    brief:
      'A single concise paragraph (about 180–250 words) summarising the whole ' +
      'report: the organisation, the period, the work done, the skills gained ' +
      'and the conclusion.',
  },
  {
    kind: 'DEDICATION',
    title: 'Dedication',
    chapter: null,
    brief:
      'A short dedication (2–4 sentences) offered to the people the student ' +
      'names. Keep it warm and personal.',
  },
  {
    kind: 'ACKNOWLEDGMENT',
    title: 'Acknowledgment',
    chapter: null,
    brief:
      'A short acknowledgment (2–4 short paragraphs) thanking God (where the ' +
      'names suggest it), family, the institution and the named supervisors for ' +
      'the opportunity and support during the attachment.',
  },
  {
    kind: 'INTRODUCTION',
    title: 'Introduction',
    chapter: 1,
    brief:
      'Introduce SIWES and its purpose, state the aim and objectives of the ' +
      'attachment, describe the scope, and briefly outline how the report is ' +
      'organised into chapters.',
  },
  {
    kind: 'INDUSTRIAL_EXPERIENCE',
    title: 'Industrial Experience',
    chapter: 2,
    brief:
      'The body of the report: a coherent narrative of the industrial ' +
      'experience, synthesising the daily logbook entries into organised prose ' +
      '(group related activities, do not just list days). Cover the ' +
      'organisation, the duties performed and the tools/technologies used.',
  },
  {
    kind: 'SKILLS_ACQUIRED',
    title: 'Skills Acquired',
    chapter: 3,
    brief:
      'The technical and soft skills acquired during the training, tied to the ' +
      'work actually done. Write in organised prose, not a bare list.',
  },
  {
    kind: 'DISCUSSION_CONCLUSION',
    title: 'Discussion and Conclusion',
    chapter: 4,
    brief:
      'Discuss the overall experience: what went well, the challenges faced, ' +
      'recommendations for future students and the host organisation, and a ' +
      'concluding statement on the value of the attachment.',
  },
];

export const REPORT_SECTION_KINDS = REPORT_SECTIONS.map((s) => s.kind);

export function sectionMeta(kind: ReportSectionKind): ReportSectionMeta {
  const meta = REPORT_SECTIONS.find((s) => s.kind === kind);
  if (!meta) throw new Error(`Unknown report section: ${kind}`);
  return meta;
}
