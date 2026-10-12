import { estimateCostKobo, getTokenRates } from './token-cost';

describe('token-cost', () => {
  const saved = {
    input: process.env.AI_INPUT_PRICE_KOBO_PER_MTOK,
    output: process.env.AI_OUTPUT_PRICE_KOBO_PER_MTOK,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      AI_INPUT_PRICE_KOBO_PER_MTOK: saved.input,
      AI_OUTPUT_PRICE_KOBO_PER_MTOK: saved.output,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('prices input and output tokens separately', () => {
    process.env.AI_INPUT_PRICE_KOBO_PER_MTOK = '1000000';
    process.env.AI_OUTPUT_PRICE_KOBO_PER_MTOK = '2000000';

    // 500k input @ 1,000,000/Mtok = 500,000 kobo
    // 250k output @ 2,000,000/Mtok = 500,000 kobo
    expect(estimateCostKobo(500_000, 250_000)).toBe(1_000_000);
  });

  it('treats bad or negative rates as zero rather than crashing', () => {
    process.env.AI_INPUT_PRICE_KOBO_PER_MTOK = 'nonsense';
    process.env.AI_OUTPUT_PRICE_KOBO_PER_MTOK = '-5';

    expect(getTokenRates()).toEqual({
      inputKoboPerMtok: 720_000,
      outputKoboPerMtok: 3_600_000,
    });
    expect(estimateCostKobo(1_000_000, 1_000_000)).toBe(4_320_000);
  });

  it('never returns a negative cost', () => {
    expect(estimateCostKobo(-100, -100)).toBe(0);
  });
});
