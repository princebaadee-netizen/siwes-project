import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { adminEmails } from './admin';

/**
 * Allows only signed-in users whose email is in `ADMIN_EMAILS`. Must run
 * *after* `JwtAuthGuard` (so `request.userId` is set) — apply it as
 * `@UseGuards(JwtAuthGuard, AdminGuard)`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.userId;
    const admins = adminEmails(this.config);

    // No allowlist configured means the admin API is switched off entirely —
    // reject without a database lookup.
    if (!userId || admins.length === 0) {
      throw new ForbiddenException('Admin access required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user && admins.includes(user.email.trim().toLowerCase())) {
      return true;
    }

    throw new ForbiddenException('Admin access required');
  }
}
