import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * Builds the shared throttler storage. When REDIS_URL is set the request
 * counters live in Redis so rate limits hold across every API instance;
 * otherwise we return null and @nestjs/throttler keeps its in-memory store
 * (fine for a single instance or local development).
 */
export function redisThrottlerStorageFactory(
  config: ConfigService,
): ThrottlerStorageRedisService | null {
  const url = config.get<string>('REDIS_URL');
  return url ? new ThrottlerStorageRedisService(url) : null;
}

/**
 * Provides and, when configured, tears down the Redis throttler storage.
 * Exported under the class token so `ThrottlerModule.forRootAsync` can inject
 * it (possibly null) rather than deciding at import time.
 */
@Module({
  providers: [
    {
      provide: ThrottlerStorageRedisService,
      inject: [ConfigService],
      useFactory: redisThrottlerStorageFactory,
    },
  ],
  exports: [ThrottlerStorageRedisService],
})
export class RedisThrottlerModule {}
