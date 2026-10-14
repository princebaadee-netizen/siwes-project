import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
}

/**
 * A thin wrapper over Groq's OpenAI-compatible Chat Completions API. It
 * deliberately uses the global `fetch` rather than an SDK: the backend already
 * targets Node 18+, so there is no dependency to install or keep pinned, and
 * swapping in a different provider later only touches this one file.
 *
 * Groq's free tier needs no credit card: sign up at https://console.groq.com,
 * create an API key and set GROQ_API_KEY. The default model is served on the
 * free tier; change it with AI_MODEL (see the Groq model catalogue for ids).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private get apiKey(): string | undefined {
    return process.env.GROQ_API_KEY;
  }

  private get model(): string {
    return process.env.AI_MODEL ?? 'openai/gpt-oss-120b';
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  private readonly maxRateRetries = 4;

  async generate(
    system: string,
    prompt: string,
    maxTokens = 4000,
    json = false,
  ): Promise<LlmResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured. Set GROQ_API_KEY on the backend to enable them.',
      );
    }

    const isGptOss = this.model.toLowerCase().startsWith('openai/gpt-oss');

    let res: Response;
    let body: any = null;
    for (let attempt = 0; attempt <= this.maxRateRetries; attempt++) {
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens,
            // JSON mode forces a syntactically valid JSON reply, which keeps the
            // extraction, bulk-fill-up and topic-suggestion flows from being
            // tripped up by stray prose. The prompts already say "JSON".
            ...(json ? { response_format: { type: 'json_object' } } : {}),
            // gpt-oss is a reasoning model; low effort keeps its hidden
            // reasoning tokens small so more of the per-minute budget goes to
            // actual logbook/project text (and fewer 429s on the free tier).
            ...(isGptOss ? { reasoning_effort: 'low' } : {}),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }),
        });
      } catch (err) {
        // Network-level failure (DNS, timeout, no egress). Don't leak the raw
        // error to the student — it is not something they can act on.
        this.logger.error('AI request could not be sent', err as Error);
        throw new BadGatewayException('Could not reach the AI service. Please try again.');
      }

      body = await res.json().catch(() => null);

      // The free tier throttles by tokens per minute. Hold off for the wait the
      // API asked for, then retry, so a long bulk fill-up survives a burst.
      if (res.status !== 429 || attempt >= this.maxRateRetries) break;
      const waitMs = this.rateLimitWait(res, body);
      this.logger.warn(`AI rate limit hit, retrying after ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!res!.ok) {
      const detail = body?.error?.message ?? `AI service returned HTTP ${res!.status}`;
      this.logger.error(`AI service error ${res!.status}: ${detail}`);
      throw new BadGatewayException(`AI service error: ${detail}`);
    }

    const text =
      typeof body?.choices?.[0]?.message?.content === 'string'
        ? body.choices[0].message.content
        : '';

    return {
      text,
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
      finishReason: body?.choices?.[0]?.finish_reason,
    };
  }

  /**
   * How long to wait before retrying a 429. Prefers the HTTP `Retry-After`
   * header, then a "…in {n}s…" phrase inside the API's error message.
   */
  private rateLimitWait(res: Response, body: any): number {
    const header = res.headers.get('retry-after');
    const fromHeader = header ? Number(header) : NaN;
    if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader * 1000 + 500;
    const match = /in\s+([\d.]+)s/.exec(body?.error?.message ?? '');
    if (match) return Math.ceil(Number(match[1]) * 1000) + 500;
    return 2500;
  }

  /**
   * Asks the model for JSON and parses it. Models routinely wrap JSON in
   * prose or a ```json fence even when told not to, so the outermost
   * object/array is extracted before parsing rather than trusting the reply.
   */
  async generateJson<T>(
    system: string,
    prompt: string,
    maxTokens = 4000,
  ): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    const result = await this.generate(system, prompt, maxTokens, true);
    return {
      data: this.parseJson<T>(result.text),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  private parseJson<T>(text: string): T {
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

    try {
      return JSON.parse(slice) as T;
    } catch {
      throw new BadGatewayException(
        'The AI returned a response we could not read. Please try again.',
      );
    }
  }
}
