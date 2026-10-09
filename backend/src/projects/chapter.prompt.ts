export const CHAPTER_SYSTEM =
  'You are an academic writing assistant helping a Nigerian undergraduate draft ' +
  'one chapter of their final year project. Write clear, formal, well-structured ' +
  'prose in the third person. Use sensible section subheadings where the chapter ' +
  'calls for them. Base the content only on the topic and the student\'s notes — ' +
  'do not fabricate data, statistics, or citations. Output the chapter body as ' +
  'plain text with simple headings; do not wrap it in code fences.';

export function chapterPrompt(opts: {
  title: string;
  chapterNumber: number;
  chapterTitle: string;
  rawInputText: string;
}): string {
  return [
    `Project title: ${opts.title}`,
    `Chapter ${opts.chapterNumber}: ${opts.chapterTitle}`,
    '',
    'The student provided these notes/points for the chapter:',
    '"""',
    opts.rawInputText,
    '"""',
    '',
    'Write the chapter based on these notes. Keep it focused and coherent, and do ' +
      'not add claims the notes do not support.',
  ].join('\n');
}
