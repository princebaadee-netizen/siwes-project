import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HolidaysAdminController } from './holidays-admin.controller';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [HolidaysAdminController],
  providers: [HolidaysService, PrismaService],
})
export class HolidaysModule {}
