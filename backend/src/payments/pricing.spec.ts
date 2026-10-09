import { getPrices, toKobo } from './pricing';

const KEYS = [
  'PRICE_IT_SIWES_PASS_NAIRA',
  'PRICE_PROJECT_PASS_NAIRA',
  'PRICE_BUNDLE_NAIRA',
] as const;

describe('getPrices', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('returns the documented naira defaults', () => {
    expect(getPrices()).toEqual({
      IT_SIWES_PASS: 10_000,
      PROJECT_PASS: 20_000,
      BUNDLE: 27_000,
    });
  });

  it('reads overrides from the environment', () => {
    process.env.PRICE_IT_SIWES_PASS_NAIRA = '12000';
    process.env.PRICE_PROJECT_PASS_NAIRA = '25000';
    process.env.PRICE_BUNDLE_NAIRA = '30000';

    expect(getPrices()).toEqual({
      IT_SIWES_PASS: 12_000,
      PROJECT_PASS: 25_000,
      BUNDLE: 30_000,
    });
  });

  it('defaults the bundle to 10% off the two passes', () => {
    process.env.PRICE_IT_SIWES_PASS_NAIRA = '15000';
    process.env.PRICE_PROJECT_PASS_NAIRA = '15000';

    expect(getPrices().BUNDLE).toBe(27_000);
  });

  it('ignores invalid or non-positive overrides', () => {
    process.env.PRICE_IT_SIWES_PASS_NAIRA = 'free';
    process.env.PRICE_PROJECT_PASS_NAIRA = '0';

    expect(getPrices()).toEqual({
      IT_SIWES_PASS: 10_000,
      PROJECT_PASS: 20_000,
      BUNDLE: 27_000,
    });
  });
});

describe('toKobo', () => {
  it('converts naira to kobo', () => {
    expect(toKobo(10_000)).toBe(1_000_000);
    expect(toKobo(27_000)).toBe(2_700_000);
  });

  it('rounds to whole kobo', () => {
    expect(toKobo(19.99)).toBe(1999);
  });
});
