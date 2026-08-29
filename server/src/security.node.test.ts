import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequest, handleRequestWithStorage } from './app.ts';
import { GameStorage } from './gameStorage.ts';
import { CommerceStorage } from './commerce.ts';
import { RateLimiter, RedisRateLimiter } from './rateLimiter.ts';
import { createTelegramHash } from './telegramAuth.ts';
import type { Env } from './types.ts';
import { createRequestSignature } from './requestSecurity.ts';

const env: Env = { TELEGRAM_BOT_TOKEN: '123456789:test-bot-token', JWT_SECRET: 'test-secret-that-is-longer-than-32-characters', APP_ORIGIN: 'https://play.mtx.test', AUTH_MAX_AGE_SECONDS: '300' };

async function signedInitData(overrides: { authDate?: number; user?: Record<string, unknown> } = {}): Promise<string> {
  const params = new URLSearchParams({ auth_date: String(overrides.authDate ?? Math.floor(Date.now() / 1_000)), query_id: 'test-query', user: JSON.stringify(overrides.user ?? { id: 42, first_name: 'MTX', username: 'tester' }) });
  params.set('hash', await createTelegramHash(params, env.TELEGRAM_BOT_TOKEN));
  return params.toString();
}

const authRequest = (initData: string): Request => new Request('https://api.mtx.test/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ initData }) });

async function signedRequest(url: string, token: string, sessionKey: string, init: RequestInit = {}, overrides: { nonce?: string; timestamp?: string; signature?: string } = {}): Promise<Request> {
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? init.body : '';
  const timestamp = overrides.timestamp ?? String(Date.now());
  const nonce = overrides.nonce ?? crypto.randomUUID().replace(/-/g, '');
  const signature = overrides.signature ?? await createRequestSignature(method, new URL(url).pathname, timestamp, nonce, body, sessionKey);
  return new Request(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID(), 'x-mtx-timestamp': timestamp, 'x-mtx-nonce': nonce, 'x-mtx-signature': signature } });
}

describe('Telegram authentication security', () => {
  it('issues a JWT only for valid Telegram initData', async () => {
    const response = await handleRequest(authRequest(await signedInitData()), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { token: string; sessionKey: string };
    assert.equal(payload.token.split('.').length, 3);
    const session = await handleRequest(await signedRequest('https://api.mtx.test/api/session', payload.token, payload.sessionKey), env);
    assert.equal(session.status, 200);
  });

  it('rejects tampered initData', async () => {
    const valid = await signedInitData();
    const tampered = valid.replace('MTX', 'Hacker');
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
    const response = await handleRequest(new Request('https://api.mtx.test/api/session', { headers: { 'cf-connecting-ip': crypto.randomUUID() } }), env);
    assert.equal(response.status, 401);
  });

  it('rejects unknown auth input fields', async () => {
    const request = new Request('https://api.mtx.test/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ initData: await signedInitData(), role: 'admin' }) });
    assert.equal((await handleRequest(request, env)).status, 400);
  });

  it('enforces and resets rate-limit buckets', () => {
    const limiter = new RateLimiter(2, 1_000);
    assert.equal(limiter.consume('user:42', 1_000), true);
    assert.equal(limiter.consume('user:42', 1_100), true);
    assert.equal(limiter.consume('user:42', 1_200), false);
    assert.equal(limiter.consume('user:42', 2_001), true);
  });

  it('uses an atomic Redis script for shared production rate limits', async () => {
    class FakeRedis { count = 0; commands: string[][] = []; async command<T>(parts: string[]): Promise<T> { this.commands.push(parts); this.count += 1; return this.count as T; } }
    const redis = new FakeRedis(); const limiter = new RedisRateLimiter(redis, 2, 60_000, 'mtx:rate');
    assert.equal(await limiter.consume('ip:127.0.0.1'), true); assert.equal(await limiter.consume('ip:127.0.0.1'), true); assert.equal(await limiter.consume('ip:127.0.0.1'), false);
    assert.equal(redis.commands[0][0], 'EVAL'); assert.match(redis.commands[0][1], /PEXPIRE/); assert.equal(redis.commands[0][3], 'mtx:rate:ip:127.0.0.1');
  });

  it('rejects an authenticated batch above 15 taps per second', async () => {
    const login = await handleRequest(authRequest(await signedInitData()), env);
    const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const request = await signedRequest('https://api.mtx.test/api/game/taps', token, sessionKey, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taps: 31, durationMs: 2_000, batchId: 'batch-security-0001' }),
    });
    const response = await handleRequestWithStorage(request, env, new GameStorage());
    assert.equal(response.status, 422);
    const payload = await response.json() as { flagged: boolean; state: { coins: number } };
    assert.equal(payload.flagged, true);
    assert.equal(payload.state.coins, 0);
  });

  it('updates the leaderboard after accepted taps and keeps the Telegram username', async () => {
    const login = await handleRequest(authRequest(await signedInitData()), env);
    const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const gameStorage = new GameStorage();
    const socialStorage = new (await import('./social.ts')).SocialStorage();
    const tap = await signedRequest('https://api.mtx.test/api/game/taps', token, sessionKey, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taps: 2, durationMs: 1_000, batchId: 'leaderboard-taps-0001' }),
    });
    assert.equal((await handleRequestWithStorage(tap, env, gameStorage, undefined, socialStorage)).status, 200);
    const board = await signedRequest('https://api.mtx.test/api/leaderboard', token, sessionKey);
    const response = await handleRequestWithStorage(board, env, gameStorage, undefined, socialStorage);
    const payload = await response.json() as { entries: Array<{ username: string; coins: number }> };
    assert.equal(payload.entries[0].username, 'tester');
    assert.equal(payload.entries[0].coins, 2);
  });

  it('does not charge twice when a coin purchase is replayed', async () => {
    const login = await handleRequest(authRequest(await signedInitData()), env);
    const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const gameStorage = new GameStorage();
    const commerce = new CommerceStorage();
    gameStorage.saveHot({ ...await gameStorage.stateFor('42', Date.now()), coins: 1_000 });
    const buy = async () => handleRequestWithStorage(await signedRequest('https://api.mtx.test/api/store/purchase', token, sessionKey, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'upgrade:tap', idempotencyKey: 'purchase-replay-0001' }) }), env, gameStorage, commerce);
    const first = await buy();
    const second = await buy();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as { duplicate: boolean }).duplicate, true);
    const state = await gameStorage.stateFor('42', Date.now());
    assert.equal(state.coins, 0);
    assert.equal(state.tapLevel, 1);
    assert.equal(state.profitPerTap, 2);
  });

  it('does not double-credit a replayed verified payment', async () => {
    let verifications = 0;
    const paymentEnv: Env = { ...env, PAYMENT_VERIFIER: { async verify() { verifications += 1; return { verified: true, creditedCoins: 500, status: 'confirmed' as const }; } } };
    const login = await handleRequest(authRequest(await signedInitData()), paymentEnv);
    const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const gameStorage = new GameStorage();
    const commerce = new CommerceStorage();
    const confirm = async () => handleRequestWithStorage(await signedRequest('https://api.mtx.test/api/wallet/payments/confirm', token, sessionKey, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'ton', transactionId: 'ton:verified:0001', amount: 1, asset: 'TON' }) }), paymentEnv, gameStorage, commerce);
    const first = await confirm();
    const second = await confirm();
    assert.equal(first.status, 200);
    assert.equal(((await second.json()) as { duplicate: boolean }).duplicate, true);
    assert.equal(verifications, 1);
    assert.equal((await gameStorage.stateFor('42', Date.now())).coins, 500);
  });

  it('rejects a player JWT from every admin endpoint', async () => {
    const login = await handleRequest(authRequest(await signedInitData()), env); const { token } = await login.json() as { token: string };
    const response = await handleRequest(new Request('https://api.mtx.test/api/admin/dashboard', { headers: { authorization: `Bearer ${token}`, origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() } }), { ...env, ADMIN_JWT_SECRET: 'separate-admin-secret-longer-than-32-characters' });
    assert.equal(response.status, 403);
  });

  it('uses separate admin authentication and enforces bans server-side', async () => {
    const adminEnv: Env = { ...env, ADMIN_JWT_SECRET: 'separate-admin-secret-longer-than-32-characters', ADMIN_AUTH: { async verify(input) { return input.username === 'operator' && input.password === 'correct-horse-battery' && input.otp === '123456' ? { id: 'admin-1' } : null; } } };
    const adminLogin = await handleRequest(new Request('https://api.mtx.test/api/admin/auth', { method: 'POST', headers: { 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ username: 'operator', password: 'correct-horse-battery', otp: '123456' }) }), adminEnv); assert.equal(adminLogin.status, 200); const { token: adminToken } = await adminLogin.json() as { token: string };
    const ban = await handleRequest(new Request('https://api.mtx.test/api/admin/users/ban', { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID() }, body: JSON.stringify({ userId: '42', banned: true }) }), adminEnv); assert.equal(ban.status, 200);
    const playerLogin = await handleRequest(authRequest(await signedInitData()), adminEnv); const { token: playerToken, sessionKey } = await playerLogin.json() as { token: string; sessionKey: string };
    const session = await handleRequest(await signedRequest('https://api.mtx.test/api/session', playerToken, sessionKey), adminEnv); assert.equal(session.status, 403);
  });

  it('rejects a forged request signature', async () => {
    const login = await handleRequest(authRequest(await signedInitData({ user: { id: 4201, first_name: 'MTX' } })), env); const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const request = await signedRequest('https://api.mtx.test/api/session', token, sessionKey, {}, { signature: 'Zm9yZ2VkLXNpZ25hdHVyZQ' });
    const response = await handleRequest(request, env);
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { reason: string }).reason, 'forged_signature');
  });

  it('rejects a replayed signed request', async () => {
    const login = await handleRequest(authRequest(await signedInitData({ user: { id: 4202, first_name: 'MTX' } })), env); const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const nonce = crypto.randomUUID().replace(/-/g, ''); const timestamp = String(Date.now());
    const first = await signedRequest('https://api.mtx.test/api/session', token, sessionKey, {}, { nonce, timestamp });
    const second = await signedRequest('https://api.mtx.test/api/session', token, sessionKey, {}, { nonce, timestamp });
    assert.equal((await handleRequest(first, env)).status, 200);
    const replay = await handleRequest(second, env);
    assert.equal(replay.status, 409);
    assert.equal(((await replay.json()) as { reason: string }).reason, 'replayed_request');
  });

  it('rejects signed requests outside the timestamp window', async () => {
    const login = await handleRequest(authRequest(await signedInitData({ user: { id: 4203, first_name: 'MTX' } })), env); const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    const response = await handleRequest(await signedRequest('https://api.mtx.test/api/session', token, sessionKey, {}, { timestamp: String(Date.now() - 31_000) }), env);
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { reason: string }).reason, 'stale_timestamp');
  });

  it('does not misreport an internal storage failure as unauthorized', async () => {
    const login = await handleRequest(authRequest(await signedInitData({ user: { id: 4204, first_name: 'MTX' } })), env); const { token, sessionKey } = await login.json() as { token: string; sessionKey: string };
    class FailingStorage extends GameStorage { override async stateFor(): Promise<never> { throw new Error('database unavailable'); } }
    const response = await handleRequestWithStorage(await signedRequest('https://api.mtx.test/api/game/state', token, sessionKey), env, new FailingStorage());
    assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: 'Internal server error' });
  });
});
