import { UsersController } from './users.controller';

function makeController(prisma: any, config: any) {
  return new UsersController(prisma, config);
}

describe('UsersController email gate flag', () => {
  let prisma: any;
  let config: any;
  const saved = {
    unlock: process.env.AI_DEV_UNLOCK,
    admins: process.env.ADMIN_EMAILS,
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    // ConfigService reads the environment, so mirror that in the stub.
    config = {
      get: jest.fn((key: string) =>
        key === 'ADMIN_EMAILS' ? process.env.ADMIN_EMAILS : undefined,
      ),
    };
    delete process.env.AI_DEV_UNLOCK;
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (saved.unlock === undefined) delete process.env.AI_DEV_UNLOCK;
    else process.env.AI_DEV_UNLOCK = saved.unlock;
    if (saved.admins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = saved.admins;
  });

  it('marks an unverified student as gated', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'student@example.com',
      emailVerified: false,
    });
    const controller = makeController(prisma, config);

    const me = (await controller.me('u1'))!;

    expect(me.emailGateActive).toBe(true);
    expect(me.isAdmin).toBe(false);
  });

  it('leaves a verified student ungated', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'student@example.com',
      emailVerified: true,
    });
    const controller = makeController(prisma, config);

    const me = (await controller.me('u1'))!;

    expect(me.emailGateActive).toBe(false);
  });

  it('never gates an admin, whatever the verification state', async () => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'boss@example.com',
      emailVerified: false,
    });
    const controller = makeController(prisma, config);

    const me = (await controller.me('u1'))!;

    expect(me.isAdmin).toBe(true);
    expect(me.emailGateActive).toBe(false);
  });

  it('never gates anyone when AI_DEV_UNLOCK is on', async () => {
    process.env.AI_DEV_UNLOCK = 'true';
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'student@example.com',
      emailVerified: false,
    });
    const controller = makeController(prisma, config);

    const me = (await controller.me('u1'))!;

    expect(me.emailGateActive).toBe(false);
  });
});
