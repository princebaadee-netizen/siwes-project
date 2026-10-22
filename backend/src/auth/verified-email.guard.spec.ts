import { ForbiddenException } from '@nestjs/common';
import { EMAIL_NOT_VERIFIED, VerifiedEmailGuard } from './verified-email.guard';

function contextWith(userId?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ userId }) }),
  } as any;
}

describe('VerifiedEmailGuard', () => {
  let prisma: any;
  const saved = {
    unlock: process.env.AI_DEV_UNLOCK,
    admins: process.env.ADMIN_EMAILS,
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    delete process.env.AI_DEV_UNLOCK;
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (saved.unlock === undefined) delete process.env.AI_DEV_UNLOCK;
    else process.env.AI_DEV_UNLOCK = saved.unlock;
    if (saved.admins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = saved.admins;
  });

  it('lets a verified account through', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'student@example.com',
      emailVerified: true,
    });
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith('u1'))).resolves.toBe(true);
  });

  it('refuses an unverified account with a machine-readable code', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'student@example.com',
      emailVerified: false,
    });
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith('u1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const error: any = await guard.canActivate(contextWith('u1')).catch((e) => e);
    expect(error.getResponse().code).toBe(EMAIL_NOT_VERIFIED);
  });

  it('refuses an account whose email does not match the address on file', async () => {
    // A student who signed up with a typo can still sign in; the gate is
    // exactly the thing that catches it.
    prisma.user.findUnique.mockResolvedValue({
      email: 'student@gmial.com',
      emailVerified: false,
    });
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith('u1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets an admin through even when unverified', async () => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
    prisma.user.findUnique.mockResolvedValue({
      email: 'boss@example.com',
      emailVerified: false,
    });
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith('u1'))).resolves.toBe(true);
  });

  it('lets every account through when AI_DEV_UNLOCK is on', async () => {
    process.env.AI_DEV_UNLOCK = 'true';
    prisma.user.findUnique.mockResolvedValue({
      email: 'student@example.com',
      emailVerified: false,
    });
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith('u1'))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a request with no authenticated user', async () => {
    const guard = new VerifiedEmailGuard(prisma);

    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
