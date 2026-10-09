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
}

/**
 * A thin wrapper over the Anthropic Messages API. It deliberately uses the
 * global `fetch` rather than an SDK: the backend already targets Node 18+,
 * so there is no dependency to install or keep pinned, and swapping in a
 * different provider later only touches this one file.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private get apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  }

  private get model(): string {
    return process.env.AI_MODEL ?? 'claude-sonnet-4-5';
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  async generate(system: string, prompt: string, maxTokens = 4000): Promise<LlmResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured. Set ANTHROPIC_API_KEY on the backend to enable them.',
      );
    }

    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (err) {
      // Network-level failure (DNS, timeout, no egress). Don't leak the raw
      // error to the student — it is not something they can act on.
      this.logger.error('AI request could not be sent', err as Error);
      throw new BadGatewayException('Could not reach the AI service. Please try again.');
    }

    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.error?.message ?? `AI service returned HTTP ${res.status}`;
      this.logger.error(`AI service error ${res.status}: ${detail}`);
      throw new BadGatewayException(`AI service error: ${detail}`);
    }

    const text = Array.isArray(body?.content)
      ? body.content
          .filter((block: any) => block?.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
      : '';

    return {
      text,
      inputTokens: body?.usage?.input_tokens ?? 0,
      outputTokens: body?.usage?.output_tokens ?? 0,
    };
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
    const result = await this.generate(system, prompt, maxTokens);
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
