import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { LogbookService } from './logbook.service';
import { CreateLogbookEntryDto } from './dto/create-logbook-entry.dto';
import { UpdateLogbookEntryDto } from './dto/update-logbook-entry.dto';
import { BulkFillupDto } from './dto/bulk-fillup.dto';
import { PolishLogbookDto } from './dto/polish-logbook.dto';

@Controller('logbook')
@UseGuards(JwtAuthGuard)
export class LogbookController {
  constructor(private logbookService: LogbookService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.logbookService.list(userId);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateLogbookEntryDto) {
    return this.logbookService.create(userId, dto);
  }

  // Each of these spends a paid AI call, so they are capped well below the
  // global per-IP limit to blunt cost abuse.
  @Post('bulk')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AiThrottlerGuard)
  bulkFillup(@CurrentUserId() userId: string, @Body() dto: BulkFillupDto) {
    return this.logbookService.bulkFillup(userId, dto);
  }

  @Post('polish')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AiThrottlerGuard)
  polish(@CurrentUserId() userId: string, @Body() dto: PolishLogbookDto) {
    return this.logbookService.polish(userId, dto);
  }

  @Get(':id')
  findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.logbookService.findOne(userId, id);
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpdateLogbookEntryDto) {
    return this.logbookService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.logbookService.remove(userId, id);
  }
}
