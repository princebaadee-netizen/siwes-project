export interface Prices {
  IT_SIWES_PASS: number;
  PROJECT_PASS: number;
  BUNDLE: number;
}

// All prices are in naira (whole units of ₦). Paystack is charged in kobo, but
// that conversion happens only at the point of payment — see `toKobo`.
const DEFAULT_IT_SIWES = 10_000; // ₦10,000
const DEFAULT_PROJECT = 20_000; // ₦20,000

function readNaira(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/**
 * Resolved at call time so changing the env and restarting is all it takes to
 * re-price. The bundle defaults to 10% off the two individual passes.
 */
export function getPrices(): Prices {
  const it = readNaira('PRICE_IT_SIWES_PASS_NAIRA') ?? DEFAULT_IT_SIWES;
  const project = readNaira('PRICE_PROJECT_PASS_NAIRA') ?? DEFAULT_PROJECT;
  const bundle = readNaira('PRICE_BUNDLE_NAIRA') ?? Math.round((it + project) * 0.9);
  return { IT_SIWES_PASS: it, PROJECT_PASS: project, BUNDLE: bundle };
}

/** Paystack (and the `amountKobo` column) work in kobo: ₦1 = 100 kobo. */
export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}
