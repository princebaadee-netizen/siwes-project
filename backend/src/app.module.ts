import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    // Generous baseline for normal browsing; sensitive auth routes tighten this
    // further with @Throttle (e.g. login, signup, password reset).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ItPlacementModule,
    LogbookModule,
    ProjectsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
