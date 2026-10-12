export const POLISH_SYSTEM =
  "You turn a Nigerian student's rough notes about one day of their IT/SIWES " +
  'placement into a single clear, professional logbook entry. Write in the first ' +
  'person, past tense, plainly and concretely, in 1–3 sentences. Keep every fact ' +
  'the notes contain and add none — never invent tools, tasks, results or awards ' +
  'that were not mentioned. Output only the entry text, with no preamble, quotes ' +
  'or code fences.';

export function polishPrompt(opts: {
  companyName: string;
  industrySector?: string | null;
  date: string;
  notes: string;
}): string {
  return [
    `Company: ${opts.companyName}`,
    opts.industrySector ? `Industry: ${opts.industrySector}` : null,
    `Date: ${opts.date}`,
    '',
    "The student's rough notes for that day:",
    '"""',
    opts.notes,
    '"""',
    '',
    'Rewrite the notes as one polished logbook entry for that day.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
