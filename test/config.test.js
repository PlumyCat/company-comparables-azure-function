const { validateConfig } = require('../src/config');

describe('validateConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('throws when a required variable is missing', () => {
    delete process.env.SEARXNG_URL;
    expect(() => validateConfig()).toThrow(/SEARXNG_URL/);
  });

  test('returns config when all variables are set', () => {
    process.env.SEARXNG_URL = 'url';
    process.env.CLIENT_ID = 'client';
    process.env.CLIENT_SECRET = 'secret';
    process.env.TENANT_ID = 'tenant';
    process.env.TOKEN_URL = 'token';

    const cfg = validateConfig();
    expect(cfg).toEqual({
      searxngUrl: 'url',
      clientId: 'client',
      clientSecret: 'secret',
      tenantId: 'tenant',
      tokenUrl: 'token'
    });
  });
});
