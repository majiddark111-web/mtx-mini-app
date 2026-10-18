import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'node:crypto';
import { handleRequestWithStorage } from './app.ts';
import { issueJwt, verifyJwt, PLAYER_SESSION_SECONDS } from './jwt.ts';
import { createRequestSignature, deriveSessionKey, MemoryReplayProtection } from './requestSecurity.ts';
import { GameStorage } from './gameStorage.ts';
import { CommerceStorage } from './commerce.ts';
import { SocialStorage } from './social.ts';
import { AdminStorage } from './admin.ts';
import type { Env } from './types.ts';

const env: Env = { TELEGRAM_BOT_TOKEN: 'test-bot-token-only', JWT_SECRET: 'session-tests-only-secret-longer-than-32', APP_ORIGIN: 'https://play.mtx.test' };
const user = { id: 'session-user', firstName: 'Test' };
const path = '/api/session/refresh';
async function credentials(issuedAt: number, startedAt = issuedAt, lifetime = 900) {
  return { token: await issueJwt(user, env.JWT_SECRET, lifetime, issuedAt, startedAt), sessionKey: await deriveSessionKey({ sub: user.id, iat: issuedAt }, env.JWT_SECRET) };
}
async function request(auth: Awaited<ReturnType<typeof credentials>>, body = '{}', nonce = crypto.randomUUID().replace(/-/g, ''), target = path) {
  const timestamp = String(Date.now());
  return new Request('https://api.mtx.test' + target, { method: 'POST', body, headers: {
    authorization: 'Bearer ' + auth.token, origin: env.APP_ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID(),
    'x-mtx-timestamp': timestamp, 'x-mtx-nonce': nonce,
    'x-mtx-signature': await createRequestSignature('POST', target, timestamp, nonce, body, auth.sessionKey),
  } });
}
function fixture() {
  const game = new GameStorage(); const commerce = new CommerceStorage(); const social = new SocialStorage(); const admin = new AdminStorage(); const replay = new MemoryReplayProtection();
  return { game, admin, send: (request: Request) => handleRequestWithStorage(request, env, game, commerce, social, admin, replay) };
}

describe('bounded signed player-session renewal', () => {
  it('preserves the signed issuance time when upgrading a legacy token', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 850;
    const unsigned = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, user, iat: issuedAt, exp: issuedAt + 900 })).toString('base64url');
    const token = unsigned + '.' + createHmac('sha256', env.JWT_SECRET).update(unsigned).digest('base64url');
    const sessionKey = await deriveSessionKey({ sub: user.id, iat: issuedAt }, env.JWT_SECRET);
    const response = await fixture().send(await request({ token, sessionKey }));
    assert.equal(response.status, 200);
    const next = await response.json() as { token: string };
    assert.equal((await verifyJwt(next.token, env.JWT_SECRET)).sessionStartedAt, issuedAt);
  });
  it('renews a valid token and lets the new key submit a batch exactly once', async () => {
    const now = Math.floor(Date.now() / 1000); const auth = await credentials(now - 850); const f = fixture();
    const response = await f.send(await request(auth));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const renewed = await response.json() as Awaited<ReturnType<typeof credentials>>;
    const claims = await verifyJwt(renewed.token, env.JWT_SECRET);
    assert.equal(claims.sub, user.id); assert.equal(claims.sessionStartedAt, now - 850);
    assert.ok(claims.exp > now + 800); assert.notEqual(renewed.sessionKey, auth.sessionKey);
    const batch = JSON.stringify({ batchId: 'renewal-durable-batch-001', taps: 2, durationMs: 1000 });
    for (let i = 0; i < 2; i++) assert.equal((await f.send(await request(renewed, batch, undefined, '/api/game/taps'))).status, 200);
    assert.equal((await f.game.stateFor(user.id, Date.now())).coins, 2);
  });
  it('rejects expired credentials instead of reviving them', async () => {
    const auth = await credentials(Math.floor(Date.now() / 1000) - 901);
    assert.equal((await fixture().send(await request(auth))).status, 401);
  });
  it('requires a token and a valid signature', async () => {
    const f = fixture(); const auth = await credentials(Math.floor(Date.now() / 1000));
    assert.equal((await f.send(new Request('https://api.mtx.test' + path, { method: 'POST', body: '{}' }))).status, 401);
    const unsigned = await request(auth); unsigned.headers.delete('x-mtx-signature');
    assert.equal((await f.send(unsigned)).status, 401);
    const forged = await request(auth); forged.headers.set('x-mtx-signature', 'forged');
    assert.equal((await f.send(forged)).status, 401);
  });
  it('rejects replay, banned users and caller-supplied renewal policy', async () => {
    const auth = await credentials(Math.floor(Date.now() / 1000)); const f = fixture();
    const original = await request(auth); const copy = original.clone();
    assert.equal((await f.send(original)).status, 200); assert.equal((await f.send(copy)).status, 409);
    assert.equal((await f.send(await request(auth, '{"sessionStartedAt":9999999999}'))).status, 400);
    await f.admin.ban('test-admin', user.id);
    assert.equal((await f.send(await request(auth))).status, 403);
  });
  it('caps the final token at the original eight-hour boundary', async () => {
    const now = Math.floor(Date.now() / 1000); const startedAt = now - PLAYER_SESSION_SECONDS + 40;
    const auth = await credentials(now - 100, startedAt);
    const response = await fixture().send(await request(auth));
    assert.equal(response.status, 200);
    const { token } = await response.json() as { token: string };
    const claims = await verifyJwt(token, env.JWT_SECRET);
    assert.equal(claims.exp, startedAt + PLAYER_SESSION_SECONDS);
    await assert.rejects(verifyJwt(token, env.JWT_SECRET, startedAt + PLAYER_SESSION_SECONDS), /Expired/);
  });
  it('keeps the original start through repeated renewals', async () => {
    const start = 1_000_000;
    let token = await issueJwt(user, env.JWT_SECRET, 900, start);
    for (let elapsed = 840; elapsed < PLAYER_SESSION_SECONDS; elapsed += 840) {
      const claims = await verifyJwt(token, env.JWT_SECRET, start + elapsed);
      token = await issueJwt(claims.user, env.JWT_SECRET, 900, start + elapsed, claims.sessionStartedAt);
      assert.equal((await verifyJwt(token, env.JWT_SECRET, start + elapsed)).sessionStartedAt, start);
    }
    await assert.rejects(verifyJwt(token, env.JWT_SECRET, start + PLAYER_SESSION_SECONDS), /Expired/);
  });
});
