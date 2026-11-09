import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { localRedisTestUrl } from './redisRateLimit.mjs';
import { createLoopbackGate } from './loopbackGate.mjs';
import { startFetchServer, closeHttpServer } from '../nodeHttp.mjs';
import { handleRequestWithStorage } from '../src/app.ts';
import { GameStorage } from '../src/gameStorage.ts';
import { RedisRateLimiter } from '../src/rateLimiter.ts';
import { RedisReplayProtection, deriveSessionKey, createRequestSignature } from '../src/requestSecurity.ts';
import { issueJwt } from '../src/jwt.ts';
import { appendTap, sealActiveBatch, nextTapBatch, acknowledgeTapBatch, pendingTapCount, tapBatchDuration } from '../../src/services/tapOutboxService.ts';

let phase = 'configuration';
async function waitFor(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('STATE_WAIT_TIMEOUT');
    await delay(25);
  }
}

async function main() {
  const url = localRedisTestUrl(process.env);
  const prefix = `mtx_recovery_test:${randomUUID()}`;
  const keys = new Set(), pending = [];
  let gate, client, server;
  // Separate direct connection permits bounded cleanup even when the gate is cut.
  const cleanup = createClient({ url, socket: { reconnectStrategy: false, connectTimeout: 3000 } });
  cleanup.on('error', () => {});
  try {
    phase = 'redis-connect';
    await cleanup.connect(); assert.equal(await cleanup.ping(), 'PONG');
    gate = await createLoopbackGate(56379);
    client = createClient({ url: `redis://127.0.0.1:${gate.port}/0`, socket: {
      connectTimeout: 3000,
      // Same backoff and default offline queue as nodeInfrastructure.mjs.
      reconnectStrategy: retries => Math.min(250 * 2 ** Math.min(retries, 5), 5000),
    } });
    client.on('error', () => {});
    await client.connect();
    let redisCommandFailures = 0;
    const redis = { command: async parts => {
      const cmd = [...parts];
      if (cmd[0] === 'SET') cmd[1] = `${prefix}:${cmd[1]}`;
      else assert.equal(cmd[0], 'EVAL');
      const key = cmd[0] === 'SET' ? cmd[1] : cmd[3];
      assert.ok(key.startsWith(prefix + ':')); keys.add(key);
      try { return await client.sendCommand(cmd); }
      catch (error) { redisCommandFailures++; throw error; }
    } };
    const env = { APP_ORIGIN: 'https://fixture.example.test', TELEGRAM_BOT_TOKEN: 'synthetic-only',
      JWT_SECRET: 'local-recovery-synthetic-secret-not-for-production' };
    const game = new GameStorage();
    const ip = new RedisRateLimiter(redis, 100, 60000, `${prefix}:ip`);
    const player = new RedisRateLimiter(redis, 100, 60000, `${prefix}:player`);
    const replay = new RedisReplayProtection(redis);
    const actors = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const id = `recovery-${i}`, now = Date.now(), iat = Math.floor(now / 1000), values = new Map();
      const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
      appendTap(storage, id, now); appendTap(storage, id, now + 250);
      return { id, storage, batch: sealActiveBatch(storage, id, now + 1000),
        token: await issueJwt({ id, firstName: 'Synthetic' }, env.JWT_SECRET, 900, iat),
        key: await deriveSessionKey({ sub: id, iat }, env.JWT_SECRET) };
    }));
    server = startFetchServer({ host: '127.0.0.1', port: 0, label: 'Local Redis recovery test',
      fetchHandler: req => handleRequestWithStorage(req, env, game, undefined, undefined, undefined, replay, undefined, ip, player) });
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function send(actor) {
      const path = '/api/game/taps', stamp = String(Date.now()), nonce = randomUUID();
      const body = JSON.stringify({ batchId: actor.batch.batchId, taps: actor.batch.taps, durationMs: tapBatchDuration(actor.batch) });
      const response = await globalThis.fetch(base + path, { method: 'POST', body,
        signal: globalThis.AbortSignal.timeout(15000), redirect: 'error', headers: {
          origin: env.APP_ORIGIN, authorization: `Bearer ${actor.token}`, 'content-type': 'application/json',
          'cf-connecting-ip': '192.0.2.57', 'x-mtx-timestamp': stamp, 'x-mtx-nonce': nonce,
          'x-mtx-signature': await createRequestSignature('POST', path, stamp, nonce, body, actor.key),
        } });
      return { status: response.status, data: await response.json(), nonce };
    }
    // Two real TCP outages: before credit, then after credit but before local ACK.
    for (const round of [0, 1]) {
      phase = `outage-${round}`;
      const failuresBefore = redisCommandFailures;
      gate.cut(); await waitFor(() => !client.isReady);
      const running = actors.map(actor => {
        const request = send(actor).then(value => ({ value }), error => ({ error }));
        pending.push(request); return request;
      });
      await delay(500);
      for (const actor of actors) {
        assert.equal((await game.stateFor(actor.id, Date.now())).coins, round * 2);
        assert.equal(pendingTapCount(actor.storage, actor.id), 2);
        assert.deepEqual(nextTapBatch(actor.storage, actor.id), actor.batch);
      }
      phase = `reconnect-${round}`;
      gate.restore(); await waitFor(() => client.isReady);
      const results = await Promise.all(running);
      const failedHttp = results.filter(result => result.value?.status === 500).length;
      // A 500 is only accepted during the injected outage, with Redis failures
      // observed and unchanged game state. Fresh post-recovery requests MUST be 200.
      assert.ok(redisCommandFailures - failuresBefore >= failedHttp, 'Outage 500 must have a Redis command failure');
      // Only fixed labels, numbers and booleans; never dump a request, JWT or URL.
      const knownErrors = ['Internal server error', 'Unauthorized', 'Invalid request', 'Too many requests', 'Tap sync rate limit', 'Invalid signed request'];
      for (const [i, result] of results.entries()) {
        const data = result.value?.data;
        process.stdout.write('MTX_LOCAL_REDIS_RECOVERY_RESULT ' + JSON.stringify({
          round, actor: i, transportFailed: Boolean(result.error),
          status: Number.isInteger(result.value?.status) ? result.value.status : null,
          responseError: knownErrors.includes(data?.error) ? data.error : data?.error ? 'OTHER' : null,
          duplicate: typeof data?.duplicate === 'boolean' ? data.duplicate : null,
          responseCoins: Number.isFinite(data?.state?.coins) ? data.state.coins : null,
          ownerMatches: data?.state?.userId === actors[i].id,
          storedCoins: (await game.stateFor(actors[i].id, Date.now())).coins,
          pendingTaps: pendingTapCount(actors[i].storage, actors[i].id),
          redisReady: client.isReady,
          redisCommandFailures: redisCommandFailures - failuresBefore,
        }) + '\n');
      }
      for (const [i, result] of results.entries()) {
        phase = `reconnect-${round}-actor-${i}-transport`;
        assert.equal(result.error, undefined, 'HTTP request must finish after recovery');
        phase = `reconnect-${round}-actor-${i}-status`;
        if (result.value.status === 500) {
          assert.deepEqual(result.value.data, { error: 'Internal server error' });
          assert.equal((await game.stateFor(actors[i].id, Date.now())).coins, round * 2);
        } else {
          assert.equal(result.value.status, 200);
          assert.equal(result.value.data.duplicate, round === 1);
          assert.equal(result.value.data.state.coins, 2);
          assert.equal(result.value.data.state.userId, actors[i].id);
        }
        assert.equal(pendingTapCount(actors[i].storage, actors[i].id), 2);
        assert.deepEqual(nextTapBatch(actors[i].storage, actors[i].id), actors[i].batch);
      }
      phase = `fresh-retry-${round}`;
      const failuresAfterRecovery = redisCommandFailures;
      const retried = await Promise.all(actors.map(actor => send(actor)));
      for (const [i, result] of retried.entries()) {
        phase = `fresh-retry-${round}-actor-${i}`;
        process.stdout.write('MTX_LOCAL_REDIS_RECOVERY_RETRY ' + JSON.stringify({
          round, actor: i, status: result.status,
          duplicate: typeof result.data?.duplicate === 'boolean' ? result.data.duplicate : null,
          coins: Number.isFinite(result.data?.state?.coins) ? result.data.state.coins : null,
        }) + '\n');
        assert.equal(result.status, 200, 'Fresh request after recovery must succeed');
        assert.notEqual(result.nonce, results[i].value.nonce);
        assert.equal(result.data.duplicate, round === 1 || results[i].value.status === 200);
        assert.equal(result.data.state.coins, 2);
        assert.equal(result.data.state.userId, actors[i].id);
        if (round === 1) acknowledgeTapBatch(actors[i].storage, actors[i].id, actors[i].batch.batchId);
      }
      assert.equal(redisCommandFailures, failuresAfterRecovery, 'Recovered transport must stay usable');
    }
    for (const actor of actors) {
      assert.equal(pendingTapCount(actor.storage, actor.id), 0);
      assert.equal((await game.stateFor(actor.id, Date.now())).coins, 2);
    }
    phase = 'cleanup';
  } finally {
    // Stop queued commands before deleting the keys; never stop the Redis server.
    if (client?.isOpen) client.destroy();
    await Promise.allSettled(pending);
    if (gate) await gate.close();
    if (server) await closeHttpServer(server);
    try {
      if (keys.size) {
        assert.ok(cleanup.isReady, 'Cleanup connection unavailable');
        await cleanup.del([...keys]); assert.equal(await cleanup.exists([...keys]), 0);
      }
    } finally { if (cleanup.isOpen) cleanup.destroy(); }
  }
  process.stdout.write('MTX_LOCAL_REDIS_RECOVERY_PASS: 2 TCP outages, 6 users, queued taps preserved, automatic reconnect, duplicate credit prevented, 12 coins total, cleanup\n');
}
main().catch(error => {
  const configErrors = ['LOCAL_REDIS_OPT_IN_REQUIRED', 'LOCAL_REDIS_CONFIG_INVALID'];
  const code = configErrors.includes(error?.message) ? error.message
    : typeof error?.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'CHECK_FAILED';
  process.stderr.write(`MTX_LOCAL_REDIS_RECOVERY_FAIL phase=${phase} code=${code}\n`);
  process.exitCode = 1;
});
