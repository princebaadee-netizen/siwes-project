import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { isAdminEmailFromEnv } from './admin';

/**
 * Machine-readable marker the client looks for, so it can show "verify your
 * email" instead of a generic failure.
 */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/**
 * Blocks the actions that cost money — a paid model call or a checkout —
 * until the student has confirmed their email address.
 *
 * It is a soft gate on purpose: everything that needs no mail still works, so
 * a student whose verification mail is slow, misfiled or never arrived can
 * still work on their logbook, project and report. What it stops is the abuse
 * the address would otherwise let in — throwaway signups burning AI tokens
 * and buying passes on a typo they never notice.
 *
 * Must run *after* `JwtAuthGuard` (so `request.userId` is set) — apply it as
 * `@UseGuards(VerifiedEmailGuard, AiThrottlerGuard)` so the check happens
 * before the AI rate limit is charged for a request that will be refused.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId: string | undefined = (request as any).userId;

    if (!userId) {
      throw new ForbiddenException('Sign in to continue.');
    }

    // Dev-only: unlocks every account from the paywall, so it lifts this gate
    // too — otherwise a local run with no mail provider could never reach the
    // AI routes at all.
    if (process.env.AI_DEV_UNLOCK === 'true') return true;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });

    if (user?.emailVerified) return true;

    // Admins are exempt for the same reason they bypass the paywall: an admin
    // locked out of the app helps nobody.
    if (isAdminEmailFromEnv(user?.email)) return true;

    throw new ForbiddenException({
      message:
        'Verify your email address to use AI features and buy a pass. Check your inbox, or resend the verification email from the banner.',
      code: EMAIL_NOT_VERIFIED,
    });
  }
}
