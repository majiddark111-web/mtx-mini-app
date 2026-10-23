import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlayerSessionController, SessionExpiredError, SessionRejectedError, type SessionCredentials } from './playerSession.ts';
import { appendTap, sealActiveBatch, nextTapBatch, type TapOutboxStorage } from './tapOutboxService.ts';

const start = 1_000_000;
function credentials(iat = start, expires = iat + 900, sub = '42', startedAt = start): SessionCredentials {
  return { token: 'header.' + btoa(JSON.stringify({ sub, iat, exp: expires, sessionStartedAt: startedAt })) + '.signature', sessionKey: 'test-key-' + iat };
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('player-session lifecycle', () => {
  it('does not renew early and shares one renewal across concurrent operations', async () => {
    let now = start * 1000; let calls = 0; const pending = deferred<SessionCredentials>();
    const session = new PlayerSessionController(async () => { calls++; return pending.promise; }, () => assert.fail('unexpected expiry'), () => now);
    session.install(credentials()); await session.ensure(); assert.equal(calls, 0);
    now += 840_000;
    const requests = Array.from({ length: 20 }, () => session.ensure());
    assert.equal(calls, 1);
    pending.resolve(credentials(start + 840));
    const results = await Promise.all(requests);
    assert.ok(results.every((result) => result.token === credentials(start + 840).token));
  });
  it('backs off transient failures while the old token is valid', async () => {
    let now = (start + 840) * 1000; let calls = 0;
    const session = new PlayerSessionController(async () => { calls++; throw new Error('network unavailable'); }, () => assert.fail('unexpected expiry'), () => now);
    session.install(credentials());
    assert.equal((await session.ensure()).token, credentials().token);
    await session.ensure(); assert.equal(calls, 1);
    now += 15_000; await session.ensure(); assert.equal(calls, 2);
  });
  it('expires once after suspension/offline past expiry, without sending refresh', async () => {
    let now = start * 1000; let expired = 0; let calls = 0;
    const session = new PlayerSessionController(async () => { calls++; return credentials(start + 840); }, () => expired++, () => now);
    session.install(credentials()); now += 900_000;
    await assert.rejects(session.ensure(), SessionExpiredError);
    await assert.rejects(session.ensure(), SessionExpiredError);
    assert.equal(expired, 1); assert.equal(calls, 0); assert.equal(session.current(), undefined);
  });
  it('fails closed on a rejected refresh', async () => {
    let expired = 0;
    const session = new PlayerSessionController(async () => { throw new SessionRejectedError(); }, () => expired++, () => (start + 840) * 1000);
    session.install(credentials());
    await assert.rejects(session.ensure(), SessionExpiredError);
    assert.equal(expired, 1); assert.equal(session.usable(), false);
  });
  it('does not let late failures or successes erase/overwrite a newer login', async () => {
    for (const fail of [false, true]) {
      const pending = deferred<SessionCredentials>(); const now = (start + 840) * 1000;
      const session = new PlayerSessionController(() => pending.promise, () => assert.fail('unexpected expiry'), () => now);
      session.install(credentials()); const old = session.ensure();
      const fresh = credentials(start + 840, start + 1740, 'new-user', start + 840);
      session.install(fresh);
      if (fail) pending.reject(new SessionRejectedError()); else pending.resolve(credentials(start + 840));
      await assert.rejects(old, SessionExpiredError);
      session.reject(credentials().token);
      assert.equal(session.current()?.token, fresh.token);
    }
  });
  it('lets an old waiter use a newer session only for the same account', async () => {
    const pending = deferred<SessionCredentials>();
    const session = new PlayerSessionController(() => pending.promise, () => assert.fail('unexpected expiry'), () => (start + 840) * 1000);
    session.install(credentials()); const work = session.ensure();
    const fresh = credentials(start + 841, start + 1741, '42', start + 841);
    session.install(fresh); pending.reject(new SessionRejectedError());
    assert.equal((await work).token, fresh.token);
  });
  it('never resurrects a rejected session from an in-flight renewal', async () => {
    const pending = deferred<SessionCredentials>(); let expired = 0;
    const session = new PlayerSessionController(() => pending.promise, () => expired++, () => (start + 840) * 1000);
    session.install(credentials()); const work = session.ensure();
    session.reject(credentials().token); pending.resolve(credentials(start + 840));
    await assert.rejects(work, SessionExpiredError);
    assert.equal(session.current(), undefined); assert.equal(expired, 1);
  });
  it('does not turn a malformed refresh into a usable credential', async () => {
    const session = new PlayerSessionController(async () => ({ token: 'broken', sessionKey: '' }), () => assert.fail('unexpected expiry'), () => (start + 840) * 1000);
    session.install(credentials());
    assert.equal((await session.ensure()).token, credentials().token);
  });
  it('rejects a refresh that changes identity or the absolute lifetime', async () => {
    for (const response of [credentials(start + 840, start + 1740, 'other'), credentials(start + 840, start + 1740, '42', start + 840)]) {
      const session = new PlayerSessionController(async () => response, () => undefined, () => (start + 840) * 1000);
      session.install(credentials()); await assert.rejects(session.ensure(), SessionExpiredError);
      assert.equal(session.current(), undefined);
    }
  });
  it('does not loop renewals at the absolute session boundary', async () => {
    let now = (start + 28_760) * 1000; let calls = 0;
    const session = new PlayerSessionController(async () => { calls++; return credentials(); }, () => undefined, () => now);
    session.install(credentials(start + 28_000, start + 28_800));
    await session.ensure(); assert.equal(calls, 0);
    now = (start + 28_800) * 1000; await assert.rejects(session.ensure(), SessionExpiredError);
  });
  it('preserves pending taps and their original identity across expiry and fresh login', async () => {
    class MemoryStorage implements TapOutboxStorage {
      private values = new Map<string, string>();
      getItem(key: string) { return this.values.get(key) ?? null; }
      setItem(key: string, value: string) { this.values.set(key, value); }
    }
    const storage = new MemoryStorage(); let now = start * 1000;
    appendTap(storage, '42', now, '11111111-1111-4111-8111-111111111111'); sealActiveBatch(storage, '42', now + 1000);
    const before = nextTapBatch(storage, '42');
    assert.ok(before, 'the fixture must contain an actual pending batch');
    assert.equal(before.taps, 1);
    const session = new PlayerSessionController(async () => { throw new Error('offline'); }, () => sealActiveBatch(storage, '42'), () => now);
    session.install(credentials()); now += 901_000;
    await assert.rejects(session.ensure(), SessionExpiredError);
    session.install(credentials(start + 901, start + 1801, '42', start + 901));
    await session.ensure();
    assert.deepEqual(nextTapBatch(storage, '42'), before);
    assert.equal(nextTapBatch(storage, 'other-user'), undefined);
  });
});
