import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits the paid AI routes by signed-in account rather than by IP, so a
 * whole campus or office behind one NAT address shares fairly instead of
 * draining a single per-IP budget.
 *
 * This must run *after* `JwtAuthGuard`, so it is applied at the route level
 * (route guards run after controller guards) with `request.userId` already set.
 * The global `ThrottlerGuard` still enforces its per-IP limit independently;
 * this layers the per-account dimension on top, using the same `@Throttle`
 * limits.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.userId) return `user:${req.userId}`;
    return `ip:${req.ip}`;
  }
}
