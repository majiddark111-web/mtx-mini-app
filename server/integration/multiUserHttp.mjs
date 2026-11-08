import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { startFetchServer, closeHttpServer } from '../nodeHttp.mjs';
import { handleRequestWithStorage } from '../src/app.ts';
import { GameStorage } from '../src/gameStorage.ts';
import { createGameState } from '../src/gameEngine.ts';
import { PostgresGameplayPersistence } from '../src/gameplayPersistence.ts';
import { PostgresGameRepository } from '../src/productionStorage.ts';
import { CommerceStorage } from '../src/commerce.ts';
import { PostgresCommercePersistence } from '../src/commercePersistence.ts';
import { issueJwt } from '../src/jwt.ts';
import { createRequestSignature, deriveSessionKey } from '../src/requestSecurity.ts';

// db must be the UUID-scoped adapter from the local-only payment runner.
export async function runMultiUserHttp(db) {
  const env = { APP_ORIGIN: 'https://fixture.example.test', TELEGRAM_BOT_TOKEN: 'fixture-only-token',
    JWT_SECRET: 'multi-user-local-only-secret-not-for-deployment', POSTGRES: db };
  const game = new GameStorage(new PostgresGameRepository(db), undefined, new PostgresGameplayPersistence(db));
  const payments = new PostgresCommercePersistence(db);
  const commerce = new CommerceStorage(payments);
  const actors = [];
  for (let i = 0; i < 6; i++) {
    const id = 'http-user-' + i, order = 'synthetic-http-payment-' + i, start = 100 + i, now = Date.now();
    const initial = createGameState(id, now);
    await payments.commitPayment({ transactionId: order, userId: id, provider: 'ton', asset: 'TON', amount: 0.01,
      status: 'confirmed', creditedCoins: start, createdAt: now }, initial.version, { ...initial, version: initial.version + 1, coins: start });
    const iat = Math.floor(now / 1000);
    actors.push({ id, order, start, token: await issueJwt({ id, firstName: 'Test' }, env.JWT_SECRET, 900, iat),
      key: await deriveSessionKey({ sub: id, iat }, env.JWT_SECRET) });
  }
  const server = startFetchServer({ fetchHandler: req => handleRequestWithStorage(req, env, game, commerce),
    host: '127.0.0.1', port: 0, label: 'Temporary multi-user API' });
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const times = { taps: [], history: [] };
    async function check(actor, kind, round) {
      const tap = kind === 'taps', method = tap ? 'POST' : 'GET', path = tap ? '/api/game/taps' : '/api/history';
      const body = tap ? JSON.stringify({ batchId: 'shared-http-batch-' + Math.min(round, 2), durationMs: 1000, taps: 2 }) : '';
      const stamp = String(Date.now()), nonce = randomUUID();
      const signature = await createRequestSignature(method, path, stamp, nonce, body, actor.key);
      const before = performance.now();
      const res = await globalThis.fetch(base + path, { method, body: tap ? body : undefined, redirect: 'error', signal: globalThis.AbortSignal.timeout(15000),
        headers: { authorization: 'Bearer ' + actor.token, origin: env.APP_ORIGIN, 'content-type': 'application/json',
          'x-mtx-nonce': nonce, 'x-mtx-signature': signature, 'x-mtx-timestamp': stamp } });
      const data = await res.json();
      times[kind].push(performance.now() - before);
      assert.equal(res.status, 200);
      if (tap) {
        assert.equal(data.state.userId, actor.id);
        assert.equal(data.acceptedTaps, 2);
        assert.equal(data.duplicate, round === 3);
        assert.equal(data.state.coins, actor.start + 2 * Math.min(round + 1, 3));
      } else {
        assert.deepEqual(data.payments.map(p => [p.userId,p.transactionId,p.creditedCoins]), [[actor.id, actor.order, actor.start]]);
      }
    }
    for (let round = 0; round < 4; round++) {
      const outcomes = await Promise.allSettled(actors.flatMap(actor => ['taps', 'history'].map(kind => check(actor, kind, round))));
      const errors = outcomes.filter(o => o.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map(o => o.reason), 'Mixed HTTP round failed');
    }
    for (const actor of actors) {
      assert.equal((await game.stateFor(actor.id, Date.now())).coins, actor.start + 6);
      const {rows} = await db.query('SELECT count(*)::int AS n FROM mtx_tap_receipts WHERE user_id=$1', [actor.id]);
      assert.equal(rows[0].n, 3);
    }
    const stats = Object.fromEntries(Object.entries(times).map(([kind,values]) => {
      values.sort((a,b) => a-b);
      const q = p => Math.round(values[Math.ceil(values.length*p)-1]);
      return [kind,{ requests: values.length, p50ms: q(.5), p95ms: q(.95), maxMs: q(1) }];
    }));
    console.log('MULTI_USER_HTTP_PASS', JSON.stringify({ users: actors.length, peakConcurrent: 12, errors: 0, stats }));
  } finally { await closeHttpServer(server); }
}
