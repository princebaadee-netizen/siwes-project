import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TopicsController } from './topics.controller';
import { TopicsAdminController } from './topics-admin.controller';
import { TopicsService } from './topics.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [TopicsController, TopicsAdminController],
  providers: [TopicsService, PrismaService],
})
export class TopicsModule {}
