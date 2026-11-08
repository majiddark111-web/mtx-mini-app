import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import console from 'node:console';
import { startFetchServer, closeHttpServer } from '../nodeHttp.mjs';
import { handleRequestWithStorage } from '../src/app.ts';
import { issueJwt } from '../src/jwt.ts';
import { deriveSessionKey, createRequestSignature } from '../src/requestSecurity.ts';
import { RateLimiter } from '../src/rateLimiter.ts';
import { GameStorage } from '../src/gameStorage.ts';
import { PostgresGameplayPersistence } from '../src/gameplayPersistence.ts';
import { PostgresGameRepository } from '../src/productionStorage.ts';
import { appendTap, sealActiveBatch, nextTapBatch, acknowledgeTapBatch, pendingTapCount, tapBatchDuration } from '../../src/services/tapOutboxService.ts';
import { reconciledTapState } from '../../src/services/gameService.ts';

export async function verifySharedIpRetry(db) {
  const env = { APP_ORIGIN: 'https://fixture.example.test', TELEGRAM_BOT_TOKEN: 'local-test-token', JWT_SECRET: 'local-shared-ip-test-secret-at-least-32' };
  const game = new GameStorage(new PostgresGameRepository(db), undefined, new PostgresGameplayPersistence(db));
  const limiter = new RateLimiter(60, 60_000);
  let elapsed = 0; // Only the IP limiter clock advances; JWTs and signatures use real time.
  const controlledIp = { consume: key => limiter.consume(key, elapsed) };
  const server = startFetchServer({ host: '127.0.0.1', port: 0, label: 'Shared IP test',
    fetchHandler: req => handleRequestWithStorage(req, env, game, undefined, undefined, undefined, undefined, undefined, controlledIp) });
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const actors = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const id = 'vpn-test-' + i, iat = Math.floor(Date.now()/1000), values = new Map();
      const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
      const at = Date.now();
      appendTap(storage,id,at); appendTap(storage,id,at+250);
      const batch = sealActiveBatch(storage,id,at+500);
      return { id, storage, batch, token: await issueJwt({ id, firstName: 'Synthetic' },env.JWT_SECRET,900,iat),
        key: await deriveSessionKey({ sub:id,iat },env.JWT_SECRET) };
    }));
    async function request(actor, tap=false, ip='192.0.2.8') {
      const method=tap?'POST':'GET', path=tap?'/api/game/taps':'/api/session';
      const batch=nextTapBatch(actor.storage,actor.id);
      const body=tap?JSON.stringify({batchId:batch.batchId,taps:batch.taps,durationMs:tapBatchDuration(batch)}):'';
      const stamp=String(Date.now()),nonce=randomUUID();
      const res=await globalThis.fetch(base+path,{method,body:tap?body:undefined,redirect:'error',signal:globalThis.AbortSignal.timeout(15000),
        headers:{origin:env.APP_ORIGIN,authorization:'Bearer '+actor.token,'content-type':'application/json','cf-connecting-ip':ip,
          'x-mtx-nonce':nonce,'x-mtx-timestamp':stamp,'x-mtx-signature':await createRequestSignature(method,path,stamp,nonce,body,actor.key)}});
      return {status:res.status,data:await res.json()};
    }
    for (let round=0;round<10;round++) {
      const results=await Promise.all(actors.map(a=>request(a)));
      assert.ok(results.every(r=>r.status===200));
    }
    elapsed=59999;
    for (const r of await Promise.all(actors.map(a=>request(a,true)))) {
      assert.equal(r.status,429);
      assert.throws(()=>reconciledTapState(r.status,r.data));
    }
    assert.equal((await request(actors[0],false,'192.0.2.9')).status,200,'another IP has its own budget');
    for (const a of actors) {
      assert.deepEqual(nextTapBatch(a.storage,a.id),a.batch);
      assert.equal(pendingTapCount(a.storage,a.id),2);
      assert.equal((await game.stateFor(a.id,Date.now())).coins,0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM mtx_tap_receipts WHERE user_id=$1',[a.id])).rows[0].n,0);
    }
    elapsed=60000;
    // Simulate losing the accepted reply before the client can acknowledge it.
    for (const duplicate of [false,true]) {
      const results=await Promise.all(actors.map(a=>request(a,true)));
      for (const [i,r] of results.entries()) {
        const a=actors[i];
        assert.equal(r.status,200);
        assert.equal(r.data.state.userId,a.id);
        assert.equal(r.data.duplicate,duplicate);
        assert.equal(reconciledTapState(r.status,r.data).coins,2);
        if (duplicate) acknowledgeTapBatch(a.storage,a.id,a.batch.batchId);
      }
    }
    for (const a of actors) {
      assert.equal(pendingTapCount(a.storage,a.id),0);
      assert.equal((await game.stateFor(a.id,Date.now())).coins,2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM mtx_tap_receipts WHERE user_id=$1 AND batch_id=$2',[a.id,a.batch.batchId])).rows[0].n,1);
    }
    console.log('SHARED_IP_RETRY_PASS: 60 allowed reads, 6 blocked batches retained, separate IP allowed, 6 recovered, 6 duplicate replies, 12 coins total');
  } finally { await closeHttpServer(server); }
}
