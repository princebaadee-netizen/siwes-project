import { Module } from '@nestjs/common';
import { LogbookController } from './logbook.controller';
import { LogbookService } from './logbook.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [LogbookController],
  providers: [LogbookService, AiThrottlerGuard],
})
export class LogbookModule {}
