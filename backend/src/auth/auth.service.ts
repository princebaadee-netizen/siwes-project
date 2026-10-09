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

    return this.buildAuthResponse(user.id, user.email, user.fullName);
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

    return this.buildAuthResponse(user.id, user.email, user.fullName);
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

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private buildAuthResponse(userId: string, email: string, fullName: string) {
    const token = this.jwtService.sign({ sub: userId, email });
    return {
      accessToken: token,
      user: { id: userId, email, fullName },
    };
  }
}
