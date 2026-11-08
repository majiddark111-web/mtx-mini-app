import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { localRedisTestUrl } from './redisRateLimit.mjs';
import { startFetchServer, closeHttpServer } from '../nodeHttp.mjs';
import { handleRequestWithStorage } from '../src/app.ts';
import { GameStorage } from '../src/gameStorage.ts';
import { RedisRateLimiter } from '../src/rateLimiter.ts';
import { RedisReplayProtection, deriveSessionKey, createRequestSignature } from '../src/requestSecurity.ts';
import { issueJwt } from '../src/jwt.ts';
import { appendTap, sealActiveBatch, nextTapBatch, acknowledgeTapBatch, pendingTapCount, tapBatchDuration } from '../../src/services/tapOutboxService.ts';

// Real HTTP and Redis; synthetic accounts and in-memory gameplay, no PostgreSQL.
let phase = 'configuration';
async function main() {
  const url = localRedisTestUrl(process.env);
  const prefix = `mtx_local_http_test:${randomUUID()}`;
  const keys = new Set();
  const client = createClient({ url, socket: { reconnectStrategy: false, connectTimeout: 3000 } });
  client.on('error', () => {});
  const redis = { command: async parts => {
    const cmd = [...parts];
    // Scope every replay key as well as both rate limiters to this test run.
    if (cmd[0] === 'SET') cmd[1] = `${prefix}:${cmd[1]}`;
    else assert.equal(cmd[0], 'EVAL');
    const key = cmd[0] === 'EVAL' ? cmd[3] : cmd[1];
    assert.ok(key.startsWith(prefix + ':'));
    if (client.isReady) keys.add(key);
    return client.sendCommand(cmd);
  } };
  let server;
  try {
    phase = 'redis-connect';
    await client.connect();
    assert.equal(await client.ping(), 'PONG');
    const env = { APP_ORIGIN: 'https://fixture.example.test', TELEGRAM_BOT_TOKEN: 'synthetic-only-bot',
      JWT_SECRET: 'synthetic-local-redis-http-secret-not-for-production' };
    const game = new GameStorage();
    const ip = new RedisRateLimiter(redis, 20, 5000, `${prefix}:ip`);
    const player = new RedisRateLimiter(redis, 120, 60000, `${prefix}:player`);
    const replay = new RedisReplayProtection(redis);
    const actors = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const id = `redis-http-${i}`, iat = Math.floor(Date.now() / 1000), values = new Map();
      const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
      const at = Date.now();
      appendTap(storage, id, at); appendTap(storage, id, at + 250);
      const batch = sealActiveBatch(storage, id, at + 1000);
      return { id, storage, batch, token: await issueJwt({ id, firstName: 'Synthetic' }, env.JWT_SECRET, 900, iat),
        key: await deriveSessionKey({ sub: id, iat }, env.JWT_SECRET) };
    }));
    phase = 'http-start';
    server = startFetchServer({ host: '127.0.0.1', port: 0, label: 'Local Redis HTTP test',
      fetchHandler: req => handleRequestWithStorage(req, env, game, undefined, undefined, undefined, replay, undefined, ip, player) });
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function send(actor, tap = false, address = '192.0.2.55', saved) {
      const path = tap ? '/api/game/taps' : '/api/session', method = tap ? 'POST' : 'GET';
      const batch = actor.batch;
      const body = tap ? JSON.stringify({ batchId: batch.batchId, taps: batch.taps, durationMs: tapBatchDuration(batch) }) : '';
      const stamp = saved?.stamp ?? String(Date.now()), nonce = saved?.nonce ?? randomUUID();
      const res = await globalThis.fetch(base + path, { method, body: tap ? body : undefined,
        redirect: 'error', signal: globalThis.AbortSignal.timeout(10000), headers: {
          origin: env.APP_ORIGIN, authorization: `Bearer ${actor.token}`, 'content-type': 'application/json',
          'cf-connecting-ip': address, 'x-mtx-timestamp': stamp, 'x-mtx-nonce': nonce,
          'x-mtx-signature': await createRequestSignature(method, path, stamp, nonce, body, actor.key),
        } });
      return { status: res.status, data: await res.json(), retry: res.headers.get('retry-after'),
        expose: res.headers.get('access-control-expose-headers'), stamp, nonce };
    }
    phase = 'fill-ip-quota';
    const reads = await Promise.all(Array.from({ length: 20 }, (_, i) => send(actors[i % 6])));
    assert.ok(reads.every(r => r.status === 200));
    phase = 'http-429';
    const blocked = await Promise.all(actors.map(a => send(a, true)));
    for (const [i, r] of blocked.entries()) {
      assert.equal(r.status, 429);
      assert.deepEqual(r.data, { error: 'Too many requests' });
      assert.match(r.retry, /^[1-5]$/);
      assert.equal(r.expose, 'Retry-After');
      assert.deepEqual(nextTapBatch(actors[i].storage, actors[i].id), actors[i].batch);
      assert.equal(pendingTapCount(actors[i].storage, actors[i].id), 2);
      assert.equal((await game.stateFor(actors[i].id, Date.now())).coins, 0);
    }
    assert.equal((await send(actors[0], false, '192.0.2.56')).status, 200);
    phase = 'retry-after-wait';
    await delay(Math.max(...blocked.map(r => Number(r.retry))) * 1000 + 100);
    phase = 'accepted-batches';
    const accepted = await Promise.all(actors.map(a => send(a, true)));
    for (const [i, r] of accepted.entries()) {
      assert.equal(r.status, 200);
      assert.equal(r.data.duplicate, false);
      assert.equal(r.data.state.userId, actors[i].id);
      assert.equal(r.data.state.coins, 2);
    }
    phase = 'nonce-replay';
    const repeatedNonce = await send(actors[0], true, '192.0.2.55', accepted[0]);
    assert.equal(repeatedNonce.status, 409);
    assert.equal(repeatedNonce.data.reason, 'replayed_request');
    phase = 'lost-reply-retry';
    // Ignore the first accepted responses; retry the same batch with fresh nonces.
    for (const [i, r] of (await Promise.all(actors.map(a => send(a, true)))).entries()) {
      assert.equal(r.status, 200);
      assert.equal(r.data.duplicate, true);
      assert.equal(r.data.state.coins, 2);
      assert.notEqual(r.nonce, accepted[i].nonce);
      acknowledgeTapBatch(actors[i].storage, actors[i].id, actors[i].batch.batchId);
      assert.equal(pendingTapCount(actors[i].storage, actors[i].id), 0);
    }
    phase = 'redis-cleanup';
    await client.del([...keys]);
    assert.equal(await client.exists([...keys]), 0);
    keys.clear();
    await client.quit();
    phase = 'redis-unavailable';
    assert.equal((await send(actors[0], true)).status, 500);
    assert.equal((await game.stateFor(actors[0].id, Date.now())).coins, 2);
    process.stdout.write('MTX_LOCAL_REDIS_HTTP_PASS: 6 users, HTTP 429 + Retry-After, real expiry, nonce replay rejected, duplicate batches credited once, 12 coins total, cleanup\n');
  } finally {
    try { if (server) await closeHttpServer(server); }
    finally {
      try {
        if (keys.size && client.isReady) {
          await client.del([...keys]);
          assert.equal(await client.exists([...keys]), 0);
        } else if (keys.size) process.stderr.write('MTX_LOCAL_REDIS_HTTP_CLEANUP_NOT_VERIFIED\n');
      } finally { if (client.isOpen) client.destroy(); }
    }
  }
}
main().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'CHECK_FAILED';
  process.stderr.write(`MTX_LOCAL_REDIS_HTTP_FAIL phase=${phase} code=${code}\n`);
  process.exitCode = 1;
});
