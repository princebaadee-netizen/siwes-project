import { ConfigService } from '@nestjs/config';

/**
 * Admins are configured with a comma-separated `ADMIN_EMAILS` env allowlist
 * rather than a role column, so access is granted without a schema change and
 * ties to the email the student already verified. Empty/unset means no admins.
 */
export function parseAdminEmails(raw?: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function adminEmails(config: ConfigService): string[] {
  return parseAdminEmails(config.get<string>('ADMIN_EMAILS'));
}

export function isAdminEmail(config: ConfigService, email?: string | null): boolean {
  if (!email) return false;
  return adminEmails(config).includes(email.trim().toLowerCase());
}

/**
 * Env-based variant for the AI/paywall services, which read `process.env`
 * directly (like `AI_DEV_UNLOCK`) rather than injecting `ConfigService`.
 */
export function isAdminEmailFromEnv(email?: string | null): boolean {
  if (!email) return false;
  return parseAdminEmails(process.env.ADMIN_EMAILS).includes(email.trim().toLowerCase());
}
