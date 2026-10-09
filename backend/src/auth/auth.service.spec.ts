import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('AuthService password reset', () => {
  let prisma: any;
  let mail: { sendPasswordReset: jest.Mock };
  let service: AuthService;
  const savedDev = process.env.PASSWORD_RESET_DEV_MODE;
  const savedFront = process.env.FRONTEND_URL;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    mail = { sendPasswordReset: jest.fn() };
    service = new AuthService(prisma, { sign: jest.fn() } as any, mail as unknown as MailService);
    delete process.env.PASSWORD_RESET_DEV_MODE;
    delete process.env.FRONTEND_URL;
  });

  afterAll(() => {
    if (savedDev === undefined) delete process.env.PASSWORD_RESET_DEV_MODE;
    else process.env.PASSWORD_RESET_DEV_MODE = savedDev;
    if (savedFront === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = savedFront;
  });

  describe('requestPasswordReset', () => {
    it('answers the same for unknown emails, so accounts cannot be enumerated', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.requestPasswordReset('nobody@example.com');

      expect(res.ok).toBe(true);
      expect(res.devResetUrl).toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('creates a single-use token and emails a link for a known email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      mail.sendPasswordReset.mockResolvedValue(true);

      const before = Date.now();
      const res = await service.requestPasswordReset('  A@B.com ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });

      const tokenData = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(tokenData.userId).toBe('u1');
      expect(tokenData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(tokenData.expiresAt.getTime()).toBeGreaterThan(before + 59 * 60 * 1000);

      const [to, url] = mail.sendPasswordReset.mock.calls[0];
      expect(to).toBe('a@b.com');
      expect(url.startsWith('http://localhost:3000/reset-password?token=')).toBe(true);
      expect(res.devResetUrl).toBeUndefined();
    });

    it('surfaces the link only in dev mode when the mail provider is absent', async () => {
      process.env.PASSWORD_RESET_DEV_MODE = 'true';
      process.env.FRONTEND_URL = 'https://app.example.com/';
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      mail.sendPasswordReset.mockResolvedValue(false);

      const res = await service.requestPasswordReset('a@b.com');

      const [, url] = mail.sendPasswordReset.mock.calls[0];
      expect(res.devResetUrl).toBe(url);
      expect(url.startsWith('https://app.example.com/reset-password?token=')).toBe(true);
    });

    it('does not leak the link when dev mode is off', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      mail.sendPasswordReset.mockResolvedValue(false);

      const res = await service.requestPasswordReset('a@b.com');
      expect(res.devResetUrl).toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('nope', 'longenough')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.resetPassword('raw', 'longenough')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a token that was already used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });
      await expect(service.resetPassword('raw', 'longenough')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('hashes the new password and burns the token', async () => {
      const raw = 'raw-token-value';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});

      const res = await service.resetPassword(raw, 'newpassword');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256(raw) },
      });

      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: 'u1' });
      expect(await bcrypt.compare('newpassword', userUpdate.data.passwordHash)).toBe(true);

      const tokenUpdate = prisma.passwordResetToken.update.mock.calls[0][0];
      expect(tokenUpdate.where).toEqual({ id: 't1' });
      expect(tokenUpdate.data.usedAt).toBeInstanceOf(Date);
      expect(res).toEqual({ ok: true });
    });
  });
});
