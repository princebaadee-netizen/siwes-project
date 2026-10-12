import { AiThrottlerGuard } from './ai-throttler.guard';

describe('AiThrottlerGuard', () => {
  const guard = new AiThrottlerGuard([] as any, {} as any, {} as any);

  it('tracks a signed-in account by user id, not the shared IP', async () => {
    await expect(
      (guard as any).getTracker({ userId: 'u1', ip: '1.2.3.4' }),
    ).resolves.toBe('user:u1');
  });

  it('falls back to the IP when there is no user', async () => {
    await expect((guard as any).getTracker({ ip: '1.2.3.4' })).resolves.toBe('ip:1.2.3.4');
  });
});
