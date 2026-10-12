import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { TopicsService } from './topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

/**
 * Admin-only CRUD over the topic bank. Reads are public on `GET /topics`, so
 * these live under `/admin/topics` behind the JWT + email-allowlist guards.
 */
@Controller('admin/topics')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TopicsAdminController {
  constructor(private topicsService: TopicsService) {}

  @Get()
  list(@Query('field') field?: string, @Query('q') q?: string) {
    return this.topicsService.list({ field, q });
  }

  @Post()
  create(@Body() dto: CreateTopicDto) {
    return this.topicsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.topicsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.topicsService.remove(id);
  }
}
