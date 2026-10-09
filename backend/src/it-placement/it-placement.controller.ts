import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ItPlacementService } from './it-placement.service';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { GetCalendarQueryDto } from './dto/get-calendar-query.dto';

@Controller('it-placement')
@UseGuards(JwtAuthGuard)
export class ItPlacementController {
  constructor(private placementService: ItPlacementService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreatePlacementDto) {
    return this.placementService.create(userId, dto);
  }

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.placementService.getSummary(userId);
  }

  @Get('calendar')
  calendar(@CurrentUserId() userId: string, @Query() query: GetCalendarQueryDto) {
    return this.placementService.getCalendar(userId, query.from, query.to);
  }

  @Post('confirm-holidays')
  confirmHolidays(@CurrentUserId() userId: string, @Body('confirmedDates') confirmedDates: string[]) {
    return this.placementService.confirmHolidayAttendance(userId, confirmedDates ?? []);
  }
}
