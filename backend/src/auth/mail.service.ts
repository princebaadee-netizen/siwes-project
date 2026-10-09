import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin email sender. Uses Resend's HTTP API when RESEND_API_KEY is set; with no
 * provider configured it logs the message instead of failing — the password
 * reset flow still works for local development (the link appears in the
 * backend console). No SDK dependency: Resend is a single JSON POST.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  get configured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`RESEND_API_KEY not set — password reset link for ${to}: ${resetUrl}`);
      return false;
    }

    const html = `
      <p>We received a request to reset your SIWES Logbook password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request it, you can ignore this email.</p>
    `;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? 'SIWES Logbook <onboarding@resend.dev>',
          to,
          subject: 'Reset your SIWES Logbook password',
          html,
        }),
      });

      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        this.logger.error(`Resend rejected the reset email (${res.status}): ${body?.message ?? ''}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Could not send password reset email', err as Error);
      return false;
    }
  }
}
