import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private usageService: UsageService) {}

  @Get()
  summary(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    const parsed = limit === undefined ? undefined : Number(limit);
    return this.usageService.summary(
      userId,
      Number.isFinite(parsed as number) ? (parsed as number) : undefined,
    );
  }
}
