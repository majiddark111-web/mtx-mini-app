import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequestWithStorage } from './app.ts';
import { GameStorage } from './gameStorage.ts';
import { CommerceStorage } from './commerce.ts';
import { SocialStorage } from './social.ts';
import { AdminStorage } from './admin.ts';
import { issueJwt } from './jwt.ts';
import { createRequestSignature, deriveSessionKey, MemoryReplayProtection, AntiCheatMonitor } from './requestSecurity.ts';
import { RateLimiter } from './rateLimiter.ts';
import type { Env } from './types.ts';

// Entirely local: synthetic identities and memory adapters; no live secrets or database.
function fixture() {
  const env: Env = { TELEGRAM_BOT_TOKEN: 'synthetic-test-bot', JWT_SECRET: 'synthetic-multi-user-secret-at-least-32-characters', APP_ORIGIN: 'https://play.example.test' };
  const game = new GameStorage();
  const commerce = new CommerceStorage();
  const social = new SocialStorage();
  const admin = new AdminStorage();
  const replay = new MemoryReplayProtection();
  const monitor = new AntiCheatMonitor();
  const ipLimit = new RateLimiter(60, 60_000);
  const playerLimit = new RateLimiter(120, 60_000);
  const send = async (userId: string, path: string, body?: unknown, options: { keyUser?: string; expired?: boolean; nonce?: string; origin?: string } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = options.expired ? now - 100 : now;
    const token = await issueJwt({ id: userId, firstName: 'Synthetic' }, env.JWT_SECRET, options.expired ? 1 : 900, issuedAt);
    const key = await deriveSessionKey({ sub: options.keyUser ?? userId, iat: issuedAt }, env.JWT_SECRET);
    const method = body === undefined ? 'GET' : 'POST';
    const serialized = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = options.nonce ?? crypto.randomUUID();
    const signature = await createRequestSignature(method, new URL(path, 'https://api.example.test').pathname, timestamp, nonce, serialized, key);
    const request = new Request('https://api.example.test' + path, { method, body: body === undefined ? undefined : serialized, headers: {
      authorization: `Bearer ${token}`, origin: options.origin ?? env.APP_ORIGIN, 'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.1', 'x-mtx-timestamp': timestamp, 'x-mtx-nonce': nonce, 'x-mtx-signature': signature,
    } });
    return handleRequestWithStorage(request, env, game, commerce, social, admin, replay, monitor, ipLimit, playerLimit);
  };
  return { send, game, commerce };
}

describe('multi-user API security (memory adapters, not a capacity test)', () => {
  it('isolates concurrent taps and deduplication for five users sharing one IP and batch ID', async () => {
    const app = fixture();
    const users = ['8101', '8102', '8103', '8104', '8105'];
    const batch = { taps: 2, durationMs: 1000, batchId: 'shared-batch-id-0001' };
    for (let replay = 0; replay < 2; replay++) {
      const responses = await Promise.all(users.map(user => app.send(user, '/api/game/taps', batch)));
      assert.deepEqual(responses.map(response => response.status), users.map(() => 200));
    }
    for (const user of users) assert.equal((await app.game.stateFor(user, Date.now())).coins, 2);
  });

  it('rejects mixing one account token with another account signing key without mutation', async () => {
    const app = fixture();
    const response = await app.send('8101', '/api/game/taps', { taps: 1, durationMs: 1000, batchId: 'mixed-identity-0001' }, { keyUser: '8102' });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).reason, 'forged_signature');
    assert.equal((await app.game.stateFor('8101', Date.now())).coins, 0);
    assert.equal((await app.game.stateFor('8102', Date.now())).coins, 0);
  });

  it('rejects a client supplied userId in a tap body', async () => {
    const app = fixture();
    assert.equal((await app.send('8101', '/api/game/taps', { taps: 1, durationMs: 1000, batchId: 'forged-target-0001', userId: '8102' })).status, 400);
    assert.equal((await app.game.stateFor('8102', Date.now())).coins, 0);
  });

  it('rejects an expired credential before crediting any taps', async () => {
    const app = fixture();
    assert.equal((await app.send('8101', '/api/game/taps', { taps: 1, durationMs: 1000, batchId: 'expired-token-0001' }, { expired: true })).status, 401);
    assert.equal((await app.game.stateFor('8101', Date.now())).coins, 0);
  });

  it('scopes replay nonces per user but rejects reuse by the same user', async () => {
    const app = fixture();
    const nonce = 'shared-nonce-for-two-users';
    assert.equal((await app.send('8101', '/api/session', undefined, { nonce })).status, 200);
    assert.equal((await app.send('8102', '/api/session', undefined, { nonce })).status, 200);
    assert.equal((await app.send('8101', '/api/session', undefined, { nonce })).status, 409);
  });

  it('rejects a foreign browser origin even with valid credentials', async () => {
    const app = fixture();
    assert.equal((await app.send('8101', '/api/session', undefined, { origin: 'https://foreign.example.test' })).status, 403);
  });
});
