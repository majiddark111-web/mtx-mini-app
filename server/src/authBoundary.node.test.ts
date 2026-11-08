import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequestWithStorage } from './app.ts';
import { createTelegramHash } from './telegramAuth.ts';
import { issueJwt } from './jwt.ts';
import { issueAdminJwt } from './adminAuth.ts';
import { GameStorage } from './gameStorage.ts';
import { CommerceStorage } from './commerce.ts';
import { SocialStorage } from './social.ts';
import { AdminStorage } from './admin.ts';
import { AntiCheatMonitor, createRequestSignature, deriveSessionKey, MemoryReplayProtection } from './requestSecurity.ts';
import { RateLimiter } from './rateLimiter.ts';
import type { Env } from './types.ts';

function fixture() {
  const env: Env = {
    TELEGRAM_BOT_TOKEN: 'synthetic-auth-boundary-bot', JWT_SECRET: 'synthetic-player-secret-at-least-32-characters',
    ADMIN_JWT_SECRET: 'synthetic-admin-secret-at-least-32-characters', APP_ORIGIN: 'https://play.example.test',
  };
  const game = new GameStorage();
  const commerce = new CommerceStorage();
  const social = new SocialStorage();
  const admin = new AdminStorage();
  const replay = new MemoryReplayProtection();
  const monitor = new AntiCheatMonitor();
  const ipLimit = new RateLimiter(60, 60_000);
  const userLimit = new RateLimiter(120, 60_000);
  const dispatch = (request: Request) => handleRequestWithStorage(request, env, game, commerce, social, admin, replay, monitor, ipLimit, userLimit);
  const login = async (options: { bot?: string; age?: number; hash?: string } = {}) => {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - (options.age ?? 0)), user: JSON.stringify({ id: 9101, first_name: 'Synthetic' }) });
    params.set('hash', options.hash ?? await createTelegramHash(params, options.bot ?? env.TELEGRAM_BOT_TOKEN));
    return dispatch(new Request('https://api.example.test/api/auth/telegram', { method: 'POST', headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ initData: params.toString() }) }));
  };
  const requestWithToken = async (token: string, path: string, method = 'GET', key?: string, body?: unknown) => {
    const headers = new Headers({ origin: env.APP_ORIGIN, authorization: `Bearer ${token}`, 'content-type': 'application/json' });
    const serialized = body === undefined ? '' : JSON.stringify(body);
    if (key) {
      const timestamp = String(Date.now());
      const nonce = crypto.randomUUID();
      headers.set('x-mtx-timestamp', timestamp);
      headers.set('x-mtx-nonce', nonce);
      headers.set('x-mtx-signature', await createRequestSignature(method, path, timestamp, nonce, serialized, key));
    }
    return dispatch(new Request('https://api.example.test' + path, { method, headers, body: method === 'GET' ? undefined : serialized }));
  };
  return { env, login, requestWithToken, admin };
}

describe('authentication trust boundaries (synthetic credentials only)', () => {
  it('accepts valid Telegram credentials and rejects a signature from a different bot', async () => {
    const app = fixture();
    assert.equal((await app.login()).status, 200);
    const rejected = await app.login({ bot: 'another-synthetic-bot' });
    assert.equal(rejected.status, 401);
    assert.deepEqual(await rejected.json(), { error: 'Unauthorized' });
  });

  it('rejects stale, future-dated and malformed Telegram authentication', async () => {
    const app = fixture();
    for (const options of [{ age: 301 }, { age: -120 }, { hash: 'invalid-hex' }]) {
      const rejected = await app.login(options);
      assert.equal(rejected.status, 401);
      assert.deepEqual(await rejected.json(), { error: 'Unauthorized' });
    }
  });

  it('rejects a changed JWT identity even when the supplied request signature matches that identity', async () => {
    const app = fixture();
    const { token } = await (await app.login()).json() as { token: string };
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.sub = '9102'; payload.user.id = '9102';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const key = await deriveSessionKey({ sub: '9102', iat: payload.iat }, app.env.JWT_SECRET);
    assert.equal((await app.requestWithToken(parts.join('.'), '/api/session', 'GET', key)).status, 401);
  });

  it('rejects alg=none tokens and tokens signed with another secret', async () => {
    const app = fixture();
    const now = Math.floor(Date.now() / 1000);
    const token = await issueJwt({ id: '9101', firstName: 'Synthetic' }, 'wrong-synthetic-secret-at-least-32', 900, now);
    const key = await deriveSessionKey({ sub: '9101', iat: now }, app.env.JWT_SECRET);
    const parts = token.split('.');
    parts[0] = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    for (const forged of [token, parts.join('.')]) assert.equal((await app.requestWithToken(forged, '/api/session', 'GET', key)).status, 401);
  });

  it('denies a player token on all admin data and mutation routes', async () => {
    const app = fixture();
    const { token } = await (await app.login()).json() as { token: string };
    for (const route of ['dashboard', 'users', 'payments', 'items', 'logs', 'anomalies', 'notifications', 'events']) {
      assert.equal((await app.requestWithToken(token, '/api/admin/' + route)).status, 403, route);
    }
    for (const route of ['users/ban', 'notifications', 'events']) {
      assert.equal((await app.requestWithToken(token, '/api/admin/' + route, 'POST', undefined, {})).status, 403, route);
    }
    assert.deepEqual(await app.admin.snapshot(), { banned: [], logs: [], notifications: [], events: [] });
  });

  it('denies an admin token on player endpoints', async () => {
    const app = fixture();
    const token = await issueAdminJwt('synthetic-admin', app.env.ADMIN_JWT_SECRET!);
    for (const path of ['/api/session', '/api/profile', '/api/history', '/api/wallet/transactions']) {
      assert.equal((await app.requestWithToken(token, path)).status, 401, path);
    }
  });

});
