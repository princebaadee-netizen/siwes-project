// Rough cost model for the Anthropic Messages API, expressed in kobo so a
// generation log can carry an estimated spend next to its token count. The
// rates are per million tokens and are configurable because both model pricing
// and the naira exchange rate drift over time.
//
// The defaults approximate Claude Sonnet ($3 / Mtok in, $15 / Mtok out) at
// roughly ₦2,400 to the dollar. They are estimates for reporting only — the
// real bill always comes from Anthropic.
const DEFAULT_INPUT_KOBO_PER_MTOK = 720_000; // ₦7,200 / Mtok
const DEFAULT_OUTPUT_KOBO_PER_MTOK = 3_600_000; // ₦36,000 / Mtok

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
