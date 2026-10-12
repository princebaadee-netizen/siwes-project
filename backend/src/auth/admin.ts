import { ConfigService } from '@nestjs/config';

/**
 * Admins are configured with a comma-separated `ADMIN_EMAILS` env allowlist
 * rather than a role column, so access is granted without a schema change and
 * ties to the email the student already verified. Empty/unset means no admins.
 */
export function adminEmails(config: ConfigService): string[] {
  return (config.get<string>('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(config: ConfigService, email?: string | null): boolean {
  if (!email) return false;
  return adminEmails(config).includes(email.trim().toLowerCase());
}
