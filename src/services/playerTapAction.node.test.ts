import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attemptPlayerTap } from './playerTapAction.ts';
import { PlayerSessionController, SessionExpiredError, type SessionCredentials } from './playerSession.ts';
import { acknowledgeTapBatch, appendTap, loadTapOutbox, nextTapBatch, pendingTapCount, sealActiveBatch, type TapOutboxStorage } from './tapOutboxService.ts';

class MemoryStorage implements TapOutboxStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const start = 1_000_000;
function credentials(issuedAt = start): SessionCredentials {
  return { token: 'header.' + btoa(JSON.stringify({ sub: '42', iat: issuedAt, exp: issuedAt + 900, sessionStartedAt: issuedAt })) + '.signature', sessionKey: 'test-only-key' };
}

function fixture() {
  let now = start * 1000;
  let status: 'authenticated' | 'expired' = 'authenticated';
  let score = 352;
  let expiryEvents = 0;
  let refreshCalls = 0;
  const storage = new MemoryStorage();
  const session = new PlayerSessionController(async () => { refreshCalls++; throw new Error('offline'); }, () => {
    expiryEvents++;
    status = 'expired';
    sealActiveBatch(storage, '42', now);
  }, () => now);
  session.install(credentials());
  const tap = () => attemptPlayerTap(status, '42', {
    hasUsableSession: () => session.usable(),
    queueTap: (userId) => appendTap(storage, userId, now),
    applyTap: () => { score += 2; },
  });
  return { storage, session, tap, advance: (ms: number) => { now += ms; },
    snapshot: () => ({ status, score, expiryEvents, refreshCalls }),
    reopen: () => { session.install(credentials(Math.floor(now / 1000))); status = 'authenticated'; },
  };
}

describe('production tap action and offline session lifecycle', () => {
  it('blocks a tap at the exact expiry boundary without needing a timer or network response', () => {
    const app = fixture();
    app.advance(899_999);
    assert.equal(app.tap().accepted, true);
    assert.equal(pendingTapCount(app.storage, '42'), 1);
    app.advance(1);
    assert.equal(app.tap().accepted, false);
    assert.deepEqual(app.snapshot(), { status: 'expired', score: 354, expiryEvents: 1, refreshCalls: 0 });
    assert.equal(nextTapBatch(app.storage, '42')?.taps, 1);
    for (let i = 0; i < 10; i++) assert.equal(app.tap().accepted, false);
    assert.equal(app.snapshot().score, 354);
    assert.equal(pendingTapCount(app.storage, '42'), 1);
    assert.equal(app.snapshot().expiryEvents, 1);
  });

  it('handles a full offline interval, failed renewal, expiry and fresh login without losing queued taps', async () => {
    const app = fixture();
    for (let i = 0; i < 5; i++) { app.tap(); app.advance(300); }
    assert.equal(app.snapshot().score, 362);
    const originalId = loadTapOutbox(app.storage, '42')[0].batchId;
    app.advance(840_000);
    await app.session.ensure();
    assert.equal(app.snapshot().refreshCalls, 1);
    assert.equal(app.snapshot().status, 'authenticated');
    app.advance(60_000);
    await assert.rejects(app.session.ensure(), SessionExpiredError);
    assert.equal(app.tap().accepted, false);
    const sealed = nextTapBatch(app.storage, '42');
    assert.ok(sealed);
    assert.equal(sealed.batchId, originalId);
    assert.equal(sealed.taps, 5);
    assert.equal(app.snapshot().score, 362);
    app.reopen();
    assert.deepEqual(nextTapBatch(app.storage, '42'), sealed);
    assert.equal(pendingTapCount(app.storage, 'other-account'), 0);
    assert.equal(app.tap().accepted, true);
    assert.equal(pendingTapCount(app.storage, '42'), 6);
    // Simulate acknowledgement only after a successful server response.
    acknowledgeTapBatch(app.storage, '42', originalId);
    acknowledgeTapBatch(app.storage, '42', originalId);
    assert.equal(pendingTapCount(app.storage, '42'), 1);
  });

  it('stops new taps after background suspension even if no maintenance check ran', () => {
    const app = fixture();
    app.tap();
    app.advance(24 * 60 * 60 * 1000);
    assert.equal(app.tap().accepted, false);
    assert.equal(app.snapshot().status, 'expired');
    assert.equal(app.snapshot().score, 354);
    assert.equal(pendingTapCount(app.storage, '42'), 1);
  });

  it('does not acknowledge or lose an old batch when a renewal fails with pending taps', async () => {
    const app = fixture();
    app.tap();
    sealActiveBatch(app.storage, '42', start * 1000 + 1000);
    const before = nextTapBatch(app.storage, '42');
    assert.ok(before);
    app.advance(840_000);
    await app.session.ensure();
    assert.deepEqual(nextTapBatch(app.storage, '42'), before);
    app.advance(61_000);
    await assert.rejects(app.session.ensure(), SessionExpiredError);
    assert.deepEqual(nextTapBatch(app.storage, '42'), before);
  });

  it('cannot award or enqueue taps while signing in, rejected, expired or missing credentials', () => {
    for (const status of ['loading', 'error', 'expired', 'authenticated'] as const) {
      const result = attemptPlayerTap(status, '42', {
        hasUsableSession: () => false,
        queueTap: () => assert.fail('must not enqueue'),
        applyTap: () => assert.fail('must not award'),
      });
      assert.equal(result.accepted, false);
    }
  });

  it('keeps explicit demo taps separate from the authenticated outbox', () => {
    let taps = 0;
    assert.equal(attemptPlayerTap('demo', '', {
      hasUsableSession: () => assert.fail('demo has no credentials'),
      queueTap: () => assert.fail('demo must not create a pending account batch'),
      applyTap: () => { taps++; },
    }).accepted, true);
    assert.equal(taps, 1);
  });

  it('requires an account and durable storage before displaying authenticated tap credit', () => {
    const actions = {
      hasUsableSession: () => true,
      queueTap: () => { throw new Error('storage unavailable'); },
      applyTap: () => assert.fail('must not award'),
    };
    assert.equal(attemptPlayerTap('authenticated', '', actions).accepted, false);
    assert.throws(() => attemptPlayerTap('authenticated', '42', actions), /storage unavailable/);
  });

  it('signals a full batch for synchronization without awarding a tap twice', () => {
    const app = fixture();
    for (let i = 0; i < 49; i++) { assert.equal(app.tap().sealed, false); app.advance(200); }
    assert.deepEqual(app.tap(), { accepted: true, sealed: true });
    assert.equal(nextTapBatch(app.storage, '42')?.taps, 50);
    assert.equal(app.snapshot().score, 452);
  });
});
