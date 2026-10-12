import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

jest.mock('@nest-lab/throttler-storage-redis', () => ({
  ThrottlerStorageRedisService: jest
    .fn()
    .mockImplementation((url: string) => ({ url })),
}));

import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import {
  redisThrottlerStorageFactory,
  RedisThrottlerModule,
} from './redis-throttler.module';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('redisThrottlerStorageFactory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when REDIS_URL is not set, keeping the in-memory store', () => {
    const storage = redisThrottlerStorageFactory(configWith({}));

    expect(storage).toBeNull();
    expect(ThrottlerStorageRedisService).not.toHaveBeenCalled();
  });

  it('builds a Redis-backed storage from REDIS_URL', () => {
    const storage = redisThrottlerStorageFactory(
      configWith({ REDIS_URL: 'redis://localhost:6379' }),
    );

    expect(ThrottlerStorageRedisService).toHaveBeenCalledWith(
      'redis://localhost:6379',
    );
    expect(storage).toEqual({ url: 'redis://localhost:6379' });
  });
});

describe('ThrottlerModule async wiring', () => {
  it('resolves the injected storage and boots with the in-memory fallback', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
        ThrottlerModule.forRootAsync({
          imports: [RedisThrottlerModule],
          inject: [ThrottlerStorageRedisService],
          useFactory: (storage: ThrottlerStorageRedisService | null) => ({
            throttlers: [{ ttl: 60_000, limit: 100 }],
            ...(storage ? { storage } : {}),
          }),
        }),
      ],
    }).compile();

    await moduleRef.close();
    expect(moduleRef).toBeDefined();
  });
});

