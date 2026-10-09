import { MailService } from './mail.service';

describe('MailService', () => {
  const service = new MailService();
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.MAIL_FROM;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = savedFrom;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports configured=false without a key', () => {
    delete process.env.RESEND_API_KEY;
    expect(service.configured).toBe(false);
  });

  it('logs instead of sending when no provider is configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    await expect(service.sendPasswordReset('a@b.com', 'http://x/y')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend and returns true on success', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    process.env.MAIL_FROM = 'From <from@test.dev>';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;

    await expect(service.sendPasswordReset('a@b.com', 'http://x/y')).resolves.toBe(true);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test_key');

    const body = JSON.parse(opts.body);
    expect(body.to).toBe('a@b.com');
    expect(body.from).toBe('From <from@test.dev>');
    expect(body.html).toContain('http://x/y');
  });

  it('falls back to the default sender when MAIL_FROM is unset', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    delete process.env.MAIL_FROM;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;

    await service.sendPasswordReset('a@b.com', 'http://x/y');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toContain('onboarding@resend.dev');
  });

  it('returns false when Resend rejects the request', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'bad sender' }),
    }) as any;

    await expect(service.sendPasswordReset('a@b.com', 'http://x/y')).resolves.toBe(false);
  });

  it('returns false when the network call throws', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    await expect(service.sendPasswordReset('a@b.com', 'http://x/y')).resolves.toBe(false);
  });
});
