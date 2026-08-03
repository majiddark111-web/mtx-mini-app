import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequest, handleRequestWithStorage } from './app.ts';
import { GameStorage } from './gameStorage.ts';
import { RateLimiter } from './rateLimiter.ts';
import { createTelegramHash } from './telegramAuth.ts';
import type { Env } from './types.ts';

const env: Env = { TELEGRAM_BOT_TOKEN: '123456789:test-bot-token', JWT_SECRET: 'test-secret-that-is-longer-than-32-characters', APP_ORIGIN: 'https://play.lumos.test', AUTH_MAX_AGE_SECONDS: '300' };

async function signedInitData(overrides: { authDate?: number; user?: Record<string, unknown> } = {}): Promise<string> {
  const params = new URLSearchParams({ auth_date: String(overrides.authDate ?? Math.floor(Date.now() / 1_000)), query_id: 'test-query', user: JSON.stringify(overrides.user ?? { id: 42, first_name: 'Lumos', username: 'tester' }) });
  params.set('hash', await createTelegramHash(params, env.TELEGRAM_BOT_TOKEN));
  return params.toString();
}

const authRequest = (initData: string): Request => new Request('https://api.lumos.test/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ initData }) });

describe('Telegram authentication security', () => {
  it('issues a JWT only for valid Telegram initData', async () => {
    const response = await handleRequest(authRequest(await signedInitData()), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { token: string };
    assert.equal(payload.token.split('.').length, 3);
    const session = await handleRequest(new Request('https://api.lumos.test/api/session', { headers: { authorization: `Bearer ${payload.token}`, 'cf-connecting-ip': crypto.randomUUID() } }), env);
    assert.equal(session.status, 200);
  });

  it('rejects tampered initData', async () => {
    const valid = await signedInitData();
    const tampered = valid.replace('Lumos', 'Hacker');
    assert.equal((await handleRequest(authRequest(tampered), env)).status, 401);
  });

  it('rejects a forged signature', async () => {
    const params = new URLSearchParams(await signedInitData());
    params.set('hash', '0'.repeat(64));
    assert.equal((await handleRequest(authRequest(params.toString()), env)).status, 401);
  });

  it('rejects expired initData', async () => {
    const expired = await signedInitData({ authDate: Math.floor(Date.now() / 1_000) - 301 });
    assert.equal((await handleRequest(authRequest(expired), env)).status, 401);
  });

  it('rejects protected endpoints without a JWT', async () => {
    const response = await handleRequest(new Request('https://api.lumos.test/api/session', { headers: { 'cf-connecting-ip': crypto.randomUUID() } }), env);
    assert.equal(response.status, 401);
  });

  it('rejects unknown auth input fields', async () => {
    const request = new Request('https://api.lumos.test/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ initData: await signedInitData(), role: 'admin' }) });
    assert.equal((await handleRequest(request, env)).status, 400);
  });

  it('enforces and resets rate-limit buckets', () => {
    const limiter = new RateLimiter(2, 1_000);
    assert.equal(limiter.consume('user:42', 1_000), true);
    assert.equal(limiter.consume('user:42', 1_100), true);
    assert.equal(limiter.consume('user:42', 1_200), false);
    assert.equal(limiter.consume('user:42', 2_001), true);
  });

  it('rejects an authenticated batch above 15 taps per second', async () => {
    const login = await handleRequest(authRequest(await signedInitData()), env);
    const { token } = await login.json() as { token: string };
    const request = new Request('https://api.lumos.test/api/game/taps', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() },
      body: JSON.stringify({ taps: 31, durationMs: 2_000, batchId: 'batch-security-0001' }),
    });
    const response = await handleRequestWithStorage(request, env, new GameStorage());
    assert.equal(response.status, 422);
    const payload = await response.json() as { flagged: boolean; state: { coins: number } };
    assert.equal(payload.flagged, true);
    assert.equal(payload.state.coins, 0);
  });
});
