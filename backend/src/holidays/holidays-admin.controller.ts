import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

/**
 * Admin-only CRUD over the public-holiday list, mirroring the topic-bank
 * admin routes: JWT + the ADMIN_EMAILS allowlist guards on every verb.
 */
@Controller('admin/holidays')
@UseGuards(JwtAuthGuard, AdminGuard)
export class HolidaysAdminController {
  constructor(private holidaysService: HolidaysService) {}

  @Get()
  list() {
    return this.holidaysService.list();
  }

  @Post()
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidaysService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.holidaysService.remove(id);
  }
}
