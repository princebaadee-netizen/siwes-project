import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ItPlacementModule } from './it-placement/it-placement.module';
import { LogbookModule } from './logbook/logbook.module';
import { ProjectsModule } from './projects/projects.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './common/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ItPlacementModule,
    LogbookModule,
    ProjectsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
