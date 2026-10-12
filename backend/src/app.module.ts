import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ItPlacementModule } from './it-placement/it-placement.module';
import { LogbookModule } from './logbook/logbook.module';
import { ProjectsModule } from './projects/projects.module';
import { TopicsModule } from './topics/topics.module';
import { UsageModule } from './usage/usage.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './common/prisma.module';
import { RedisThrottlerModule } from './common/redis-throttler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Generous baseline for normal browsing; sensitive auth routes tighten this
    // further with @Throttle (e.g. login, signup, password reset).
    // With REDIS_URL set the counters are shared across API instances; without
    // it, @nestjs/throttler falls back to its in-memory store.
    ThrottlerModule.forRootAsync({
      imports: [RedisThrottlerModule],
      inject: [ThrottlerStorageRedisService],
      useFactory: (storage: ThrottlerStorageRedisService | null) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        ...(storage ? { storage } : {}),
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ItPlacementModule,
    LogbookModule,
    ProjectsModule,
    TopicsModule,
    UsageModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
