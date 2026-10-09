import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { LogbookService } from './logbook.service';
import { CreateLogbookEntryDto } from './dto/create-logbook-entry.dto';
import { UpdateLogbookEntryDto } from './dto/update-logbook-entry.dto';
import { BulkFillupDto } from './dto/bulk-fillup.dto';

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

  @Post('bulk')
  bulkFillup(@CurrentUserId() userId: string, @Body() dto: BulkFillupDto) {
    return this.logbookService.bulkFillup(userId, dto);
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
