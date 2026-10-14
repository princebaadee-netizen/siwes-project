// Rough cost model for the AI provider, expressed in kobo so a generation log
// can carry an estimated spend next to its token count. The rates are per
// million tokens and are configurable because both model pricing and the naira
// exchange rate drift over time.
//
// The defaults are zero because Groq's free tier costs nothing. If you move to
// a paid Groq plan (or another provider), set these to the model's rates —
// e.g. gpt-oss-120b is $0.15 / Mtok in and $0.60 / Mtok out — converted to
// kobo at your naira rate. They are estimates for reporting only.
const DEFAULT_INPUT_KOBO_PER_MTOK = 0;
const DEFAULT_OUTPUT_KOBO_PER_MTOK = 0;

function readRateKoboPerMtok(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

export interface TokenRates {
  inputKoboPerMtok: number;
  outputKoboPerMtok: number;
}

/** Resolved at call time so re-pricing is an env change and a restart. */
export function getTokenRates(): TokenRates {
  return {
    inputKoboPerMtok: readRateKoboPerMtok(
      'AI_INPUT_PRICE_KOBO_PER_MTOK',
      DEFAULT_INPUT_KOBO_PER_MTOK,
    ),
    outputKoboPerMtok: readRateKoboPerMtok(
      'AI_OUTPUT_PRICE_KOBO_PER_MTOK',
      DEFAULT_OUTPUT_KOBO_PER_MTOK,
    ),
  };
}

/** Estimated spend in kobo for one call, rounded to the nearest kobo. */
export function estimateCostKobo(inputTokens: number, outputTokens: number): number {
  const { inputKoboPerMtok, outputKoboPerMtok } = getTokenRates();
  const input = (Math.max(0, inputTokens) / 1_000_000) * inputKoboPerMtok;
  const output = (Math.max(0, outputTokens) / 1_000_000) * outputKoboPerMtok;
  return Math.round(input + output);
}
