import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { isAdminEmail } from '../auth/admin';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerified: true,
        school: true,
        department: true,
        moduleChoice: true,
        itPlacement: true,
        projects: true,
        purchases: true,
      },
    });
    if (!user) return user;
    // Derived from the email allowlist so the client can decide whether to
    // surface admin-only UI; the guard is still the real enforcement.
    return { ...user, isAdmin: isAdminEmail(this.config, user.email) };
  }

  @Patch('me')
  async updateMe(@CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      // Never echo the stored hash back to the client.
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerified: true,
        school: true,
        department: true,
        moduleChoice: true,
      },
    });
    return user;
  }
}
