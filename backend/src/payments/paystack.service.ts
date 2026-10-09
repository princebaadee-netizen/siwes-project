import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface InitializeArgs {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyResult {
  status: string;
  amount: number;
  reference: string;
  currency: string;
}

/**
 * Minimal Paystack client over the REST API. Like the AI wrapper it uses the
 * global `fetch`, so there's no SDK to install or keep pinned. The secret key
 * is read at call time so it can be set after boot.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  private get secretKey(): string | undefined {
    return process.env.PAYSTACK_SECRET_KEY;
  }

  get configured(): boolean {
    return !!this.secretKey;
  }

  async initialize(args: InitializeArgs): Promise<InitializeResult> {
    const res = await this.fetchJson('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: args.email,
        amount: args.amountKobo,
        reference: args.reference,
        callback_url: args.callbackUrl,
        metadata: args.metadata,
      }),
    });

    if (!res.ok || !res.data?.status) {
      throw new BadGatewayException(
        res.data?.message ?? 'Paystack could not start the payment.',
      );
    }
    return res.data.data as InitializeResult;
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await this.fetchJson(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    );
    if (!res.ok || !res.data?.status) {
      throw new BadGatewayException(
        res.data?.message ?? 'Paystack could not verify the payment.',
      );
    }
    return res.data.data as VerifyResult;
  }

  /**
   * Paystack signs every webhook with HMAC-SHA512 of the raw request body,
   * keyed by the secret key. The raw bytes must be used — re-serialising the
   * parsed JSON would change the payload and never match.
   */
  isValidWebhook(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.secretKey || !rawBody?.length || !signature) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(signature);
    return expectedBuf.length === givenBuf.length && timingSafeEqual(expectedBuf, givenBuf);
  }

  private async fetchJson(
    url: string,
    init: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; data: any }> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      this.logger.error('Paystack request could not be sent', err as Error);
      throw new BadGatewayException('Could not reach the payment service. Please try again.');
    }
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }
}
