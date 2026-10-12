export const TOPIC_SUGGEST_SYSTEM =
  'You are an academic advisor suggesting final year project topics for a ' +
  'Nigerian undergraduate. Suggest realistic, feasible topics that one student ' +
  'can complete with limited time and resources, and that genuinely suit the ' +
  "student's field of study. Return JSON only — no prose, no code fences.";

export function topicSuggestPrompt(opts: {
  field: string;
  interests?: string;
  count: number;
}): string {
  const interests = opts.interests?.trim();
  return [
    `Field of study: ${opts.field}`,
    interests ? `The student is interested in: ${interests}` : '',
    `Suggest exactly ${opts.count} distinct project topics.`,
    'Respond with JSON in exactly this shape:',
    '{ "topics": [ { "title": "concise topic title", "description": "one sentence on what the project does" } ] }',
    'Titles must be specific and implementable; avoid vague ideas and duplicates.',
  ]
    .filter(Boolean)
    .join('\n');
}
