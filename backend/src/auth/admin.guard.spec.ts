import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';
import { adminEmails, isAdminEmail } from './admin';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function contextWith(userId?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ userId }) }),
  } as any;
}

describe('admin email allowlist', () => {
  it('splits, trims and lower-cases ADMIN_EMAILS', () => {
    const config = configWith({ ADMIN_EMAILS: ' Boss@Example.com , ops@example.com ' });
    expect(adminEmails(config)).toEqual(['boss@example.com', 'ops@example.com']);
  });

  it('treats an unset allowlist as empty', () => {
    expect(adminEmails(configWith({}))).toEqual([]);
  });

  it('matches emails case-insensitively', () => {
    const config = configWith({ ADMIN_EMAILS: 'boss@example.com' });
    expect(isAdminEmail(config, 'BOSS@example.com')).toBe(true);
    expect(isAdminEmail(config, 'other@example.com')).toBe(false);
    expect(isAdminEmail(config, null)).toBe(false);
  });
});

describe('AdminGuard', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
  });

  it('allows a signed-in user whose email is on the allowlist', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'boss@example.com' });
    const guard = new AdminGuard(prisma, configWith({ ADMIN_EMAILS: 'boss@example.com' }));

    await expect(guard.canActivate(contextWith('u1'))).resolves.toBe(true);
  });

  it('forbids a signed-in user who is not an admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'student@example.com' });
    const guard = new AdminGuard(prisma, configWith({ ADMIN_EMAILS: 'boss@example.com' }));

    await expect(guard.canActivate(contextWith('u1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids everyone when no admins are configured', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'boss@example.com' });
    const guard = new AdminGuard(prisma, configWith({}));

    await expect(guard.canActivate(contextWith('u1'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('forbids a request with no authenticated user', async () => {
    const guard = new AdminGuard(prisma, configWith({ ADMIN_EMAILS: 'boss@example.com' }));

    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
