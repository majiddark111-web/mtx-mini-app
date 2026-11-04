import assert from 'node:assert/strict';
import { it } from 'node:test';
import { handleRequestWithStorage } from './app.ts';
import { GameStorage } from './gameStorage.ts';
import { RateLimiter } from './rateLimiter.ts';
import { issueJwt } from './jwt.ts';
import { MemoryReplayProtection, createRequestSignature, deriveSessionKey } from './requestSecurity.ts';
import { appendTap, sealActiveBatch, nextTapBatch, acknowledgeTapBatch, pendingTapCount } from '../../src/services/tapOutboxService.ts';
import { reconciledTapState } from '../../src/services/gameService.ts';
import { TapRetryWindow } from '../../src/services/tapRetryWindow.ts';

// Deterministic in-process experiment, not a hosting benchmark. No real sleeps,
// remote calls, Redis or user data. Only game time and rate windows are advanced.
async function run(waitForWindow: boolean) {
  const windowMs = 60_000, pressureEnd = 3 * windowMs, epoch = Date.now();
  let tick = 0, blocked = 0, blockedReads = 0, maxAgeMs = 0;
  const env = { JWT_SECRET: 'synthetic-pressure-experiment-secret-000', TELEGRAM_BOT_TOKEN: 'synthetic-test-bot', APP_ORIGIN: 'https://local.example.test' };
  const ip = new RateLimiter(60, windowMs), player = new RateLimiter(120, windowMs);
  const replay = new MemoryReplayProtection();
  class ClockedGame extends GameStorage {
    override applyTaps(id: string, batch: Parameters<GameStorage['applyTaps']>[1]) {
      return super.applyTaps(id, batch, epoch + tick);
    }
  }
  const game = new ClockedGame();
  const users = await Promise.all(Array.from({length:6}, async (_, i) => {
    const id = 'pressure-' + i, at = Math.floor(epoch / 1000), values = new Map<string,string>();
    return { id, token: await issueJwt({ id, firstName:'Local' }, env.JWT_SECRET, 900, at),
      key: await deriveSessionKey({sub:id,iat:at},env.JWT_SECRET), accepted:0, created:0, cooldown:new TapRetryWindow(()=>undefined,()=>epoch+tick),
      storage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}} };
  }));
  async function send(u:typeof users[number],path:string,body='') {
    const method = body ? 'POST' : 'GET', stamp=String(Date.now()), nonce=crypto.randomUUID();
    const signature=await createRequestSignature(method,path,stamp,nonce,body,u.key);
    return handleRequestWithStorage(new Request('https://api.example.test'+path,{method,body:body||undefined,headers:{
      origin:env.APP_ORIGIN,authorization:'Bearer '+u.token,'cf-connecting-ip':'192.0.2.55','content-type':'application/json',
      'x-mtx-timestamp':stamp,'x-mtx-nonce':nonce,'x-mtx-signature':signature,
    }}),env,game,undefined,undefined,undefined,replay,undefined,
    {consume:k=>ip.consume(k,tick),consumeWithDelay:k=>ip.consumeWithDelay(k,tick)},{consume:k=>player.consume(k,tick)});
  }
  const pending = () => users.map(u=>pendingTapCount(u.storage,u.id));
  const snapshots: number[][]=[];
  for (tick=0;tick<8*windowMs;tick+=2000) {
    if (tick<pressureEnd && tick%4000===0) {
      for (const u of users) {
        appendTap(u.storage,u.id,epoch+tick-1000);
        sealActiveBatch(u.storage,u.id,epoch+tick);
        u.created++;
      }
    }
    if (tick<pressureEnd && tick%6000===0) {
      const read=await send(users[(tick/6000)%users.length],'/api/session');
      if (read.status===429) blockedReads++; else assert.equal(read.status,200);
    }
    // Fixed client order is intentional: exposes ordering sensitivity rather
    // than pretending that the server enforces per-user fairness.
    for (const u of users) {
      if (u.cooldown.remaining(u.id)>0) continue;
      for (let batch=nextTapBatch(u.storage,u.id);batch;batch=nextTapBatch(u.storage,u.id)) {
        const res=await send(u,'/api/game/taps',JSON.stringify({batchId:batch.batchId,taps:batch.taps,durationMs:batch.durationMs}));
        const data=await res.json();
        if (res.status===429) {
          assert.deepEqual(data,{error:'Too many requests'});
          assert.deepEqual(nextTapBatch(u.storage,u.id),batch);
          blocked++;
          assert.equal(res.headers.get('retry-after'),String(Math.ceil((windowMs-tick%windowMs)/1000)));
          assert.equal(res.headers.get('access-control-expose-headers'),'Retry-After');
          if (waitForWindow) u.cooldown.defer(u.id,res.headers.get('retry-after'));
          break;
        }
        assert.equal(res.status,200);
        assert.equal(data.duplicate,false);
        assert.equal(data.acceptedTaps,1);
        assert.equal(reconciledTapState(res.status,data).coins,++u.accepted);
        maxAgeMs=Math.max(maxAgeMs,tick-(batch.startedAt-epoch+1000));
        acknowledgeTapBatch(u.storage,u.id,batch.batchId);
      }
    }
    if (tick%windowMs===windowMs-2000 && tick<pressureEnd) snapshots.push(pending());
    if (tick>=pressureEnd && pending().every(n=>n===0)) break;
  }
  assert.ok(tick<8*windowMs,'queues should drain within the bounded experiment');
  for (const u of users) {
    assert.equal(u.created,45); assert.equal(u.accepted,45);
    assert.equal((await game.stateFor(u.id,epoch+tick)).coins,45);
    assert.equal(pendingTapCount(u.storage,u.id),0);
  }
  assert.ok(snapshots[2].reduce((a,b)=>a+b,0)>snapshots[0].reduce((a,b)=>a+b,0));
  return {blocked,blockedReads,snapshots,drainAfterStopMs:tick-pressureEnd,maxAgeMs};
}

it('preserves six accounts under sustained shared-IP pressure and bounds the effect of repeated refusals',async t=>{
  const periodic=await run(false), wait=await run(true);
  assert.ok(periodic.blocked>wait.blocked);
  t.diagnostic(JSON.stringify({periodic,wait}));
});
