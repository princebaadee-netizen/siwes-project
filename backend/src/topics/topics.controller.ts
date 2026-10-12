import { Controller, Get, Query } from '@nestjs/common';
import { TopicsService } from './topics.service';

/**
 * Public reference data — the same catalogue is shown to everyone, so it sits
 * outside the JWT guard like /payments/prices.
 */
@Controller('topics')
export class TopicsController {
  constructor(private topicsService: TopicsService) {}

  @Get()
  list(@Query('field') field?: string, @Query('q') q?: string) {
    return this.topicsService.list({ field, q });
  }

  @Get('fields')
  fields() {
    return this.topicsService.fields();
  }
}
