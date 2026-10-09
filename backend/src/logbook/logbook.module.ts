import { Module } from '@nestjs/common';
import { LogbookController } from './logbook.controller';
import { LogbookService } from './logbook.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [LogbookController],
  providers: [LogbookService],
})
export class LogbookModule {}
