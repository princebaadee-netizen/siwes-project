import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin email sender. Uses Resend's HTTP API when RESEND_API_KEY is set; with no
 * provider configured it logs the message instead of failing — the reset and
 * verification flows still work for local development (the link appears in the
 * backend console). No SDK dependency: Resend is a single JSON POST.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  get configured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
    return this.send(
      to,
      'Reset your SIWES Logbook password',
      `<p>We received a request to reset your SIWES Logbook password.</p>
       <p><a href="${resetUrl}">Reset your password</a></p>
       <p>This link expires in 1 hour. If you didn't request it, you can ignore this email.</p>`,
      resetUrl,
    );
  }

  sendVerificationEmail(to: string, verifyUrl: string): Promise<boolean> {
    return this.send(
      to,
      'Verify your email address',
      `<p>Welcome to SIWES Logbook. Please confirm your email address.</p>
       <p><a href="${verifyUrl}">Verify your email</a></p>
       <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>`,
      verifyUrl,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    devLink: string,
  ): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(
        `RESEND_API_KEY not set — email to ${to} ("${subject}") not sent. Link: ${devLink}`,
      );
      return false;
    }

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
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        this.logger.error(`Resend rejected the email (${res.status}): ${body?.message ?? ''}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Could not send email', err as Error);
      return false;
    }
  }
}
