import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { PrismaService } from '../common/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [ReportController],
  providers: [ReportService, PrismaService, AiThrottlerGuard],
})
export class ReportModule {}
