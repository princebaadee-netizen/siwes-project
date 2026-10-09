import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        department: true,
        moduleChoice: true,
        itPlacement: true,
        projects: true,
        purchases: true,
      },
    });
    return user;
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
        school: true,
        department: true,
        moduleChoice: true,
      },
    });
    return user;
  }
}
