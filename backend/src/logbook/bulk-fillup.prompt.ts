export const EXTRACTION_SYSTEM =
  'You extract structured facts from a Nigerian student\'s free-text description of ' +
  'their IT/SIWES placement. Reply with JSON only — no prose, no code fences.';

export function extractionPrompt(description: string): string {
  return [
    'From the description below, extract the placement details.',
    'Respond with a JSON object with exactly these keys:',
    '  "school": string or null — the institution if named',
    '  "startDate": string "YYYY-MM-DD" or null — the start date if stated',
    '  "endDate": string "YYYY-MM-DD" or null — the end date if stated',
    '  "skills": array of short strings — tools, technologies and duties mentioned',
    '',
    'Do not invent details that are not present. Use null / [] when unknown.',
    '',
    'Description:',
    '"""',
    description,
    '"""',
  ].join('\n');
}

export const GENERATION_SYSTEM =
  'You write realistic entries for a Nigerian university IT/SIWES logbook. Each entry ' +
  'is one short paragraph describing what the student did on that day. Write in the ' +
  'first person, past tense, plainly and concretely. Never claim a certificate, award ' +
  'or result that was not described. Reply with JSON only — no prose, no code fences.';

export function generationPrompt(
  opts: {
    companyName: string;
    industrySector?: string | null;
    skills: string[];
  },
  dates: string[],
): string {
  return [
    `Company: ${opts.companyName}`,
    opts.industrySector ? `Industry: ${opts.industrySector}` : null,
    opts.skills.length ? `Skills/duties mentioned: ${opts.skills.join(', ')}` : null,
    '',
    `Write exactly one logbook entry for each of these dates (${dates.length} total):`,
    dates.join(', '),
    '',
    'Respond with a JSON object of the form:',
    '{ "entries": [ { "date": "YYYY-MM-DD", "activity": "..." } ] }',
    'One object per date above, in order. Each "activity" should be 1–3 sentences.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
