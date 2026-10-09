import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MailService } from './mail.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash,
        },
      });
    } catch (err) {
      // Two concurrent signups can both pass the check above; the unique
      // index is the real arbiter, so translate it rather than 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    // Fire the verification email, but never let a mail hiccup block signup.
    await this.sendVerification(user.id, user.email);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  async requestPasswordReset(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();

    // Same answer whether or not the account exists, so this endpoint can't be
    // used to discover which emails are registered.
    const response: { ok: true; message: string; devResetUrl?: string } = {
      ok: true,
      message: 'If an account exists for that email, a reset link is on its way.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return response;

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    // Only the newest link should work; drop any outstanding ones first.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: this.hashToken(rawToken), expiresAt },
    });

    const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${base}/reset-password?token=${rawToken}`;

    const delivered = await this.mail.sendPasswordReset(user.email, resetUrl);
    // Surface the link in the response only when no provider is configured and
    // explicitly opted into — a convenience for local dev, never for production.
    if (!delivered && process.env.PASSWORD_RESET_DEV_MODE === 'true') {
      response.devResetUrl = resetUrl;
    }
    return response;
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async verifyEmail(token: string) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    if (payload?.purpose !== 'verify-email' || !payload.sub) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    // updateMany so a link for a since-deleted account is a no-op, not a 500.
    await this.prisma.user.updateMany({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
    return { ok: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.emailVerified) {
      await this.sendVerification(user.id, user.email);
    }
    return { ok: true, emailVerified: user.emailVerified };
  }

  private async sendVerification(userId: string, email: string): Promise<void> {
    const token = this.jwtService.sign(
      { sub: userId, email, purpose: 'verify-email' },
      { expiresIn: '24h' },
    );
    const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    const verifyUrl = `${base}/verify-email?token=${token}`;
    await this.mail.sendVerificationEmail(email, verifyUrl);
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
  }) {
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
      },
    };
  }
}
