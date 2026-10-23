import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameDiagnostics, sessionDiagnostic } from './playerDiagnostics.ts';

describe('read-only player diagnostics', () => {
  const session = { token: 'never-display-token', sessionKey: 'never-display-key', userId: 'private-user', expiresAt: 900_000, renewUntil: 28_800_000 };
  const state = { coins: 125, version: 3, profitPerTap: 2, tapLevel: 1 };
  it('allows only status and times, never credentials or identity', () => {
    const snapshot = sessionDiagnostic(session, 839_500);
    assert.deepEqual(snapshot, { status: 'valid', expiresAt: 900_000, remainingSeconds: 61 });
    assert.equal(JSON.stringify(snapshot).includes('never-display'), false);
    assert.equal(JSON.stringify(snapshot).includes('private-user'), false);
  });
  it('observes expiry without mutating or clearing the session', () => {
    const original = { ...session };
    assert.equal(sessionDiagnostic(session, 900_000).status, 'expired');
    assert.equal(sessionDiagnostic(session, 960_000).remainingSeconds, 0);
    assert.deepEqual(session, original);
    assert.deepEqual(sessionDiagnostic(undefined, 0), { status: 'missing', expiresAt: null, remainingSeconds: null });
  });
  it('honors the absolute lifetime even if the access expiry is later', () => {
    assert.equal(sessionDiagnostic({ ...session, renewUntil: 500_000 }, 500_000).status, 'expired');
  });
  it('separates a server read from an accepted or rejected tap batch', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a');
    tracker.record('a', state, 'read', 10);
    assert.equal(tracker.snapshot('a').lastAcceptedTapAt, null);
    tracker.record('a', state, 'tap-rejected', 20);
    assert.equal(tracker.snapshot('a').lastAcceptedTapAt, null);
    assert.equal(tracker.snapshot('a').lastRejectedTapAt, 20);
    tracker.record('a', state, 'tap-accepted', 30);
    assert.equal(tracker.snapshot('a').lastAcceptedTapAt, 30);
    assert.equal(tracker.snapshot('a').serverCoins, 125);
  });
  it('does not invent server confirmation for local pending taps', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a');
    assert.equal(tracker.snapshot('a').serverCoins, null);
    assert.equal(tracker.snapshot('a').lastResponseAt, null);
  });
  it('records an expired blocked tap without claiming server activity', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a');
    tracker.recordLocalTap('a', false, 'authenticated', 'expired', 900_000);
    const value = tracker.snapshot('a');
    assert.equal(value.lastLocalTapAt, 900_000);
    assert.equal(value.lastLocalTapAccepted, false);
    assert.equal(value.lastLocalTapAuth, 'authenticated');
    assert.equal(value.lastLocalTapCredential, 'expired');
    assert.equal(value.lastResponseAt, null);
    assert.equal(value.lastAcceptedTapAt, null);
    assert.equal(value.serverCoins, null);
  });
  it('records local acceptance separately from authoritative acceptance', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a');
    tracker.recordLocalTap('a', true, 'authenticated', 'valid', 100);
    assert.equal(tracker.snapshot('a').lastLocalTapAccepted, true);
    assert.equal(tracker.snapshot('a').lastAcceptedTapAt, null);
    tracker.record('a', state, 'tap-accepted', 200);
    assert.equal(tracker.snapshot('a').lastAcceptedTapAt, 200);
    assert.equal(tracker.snapshot('a').lastLocalTapAt, 100);
  });
  it('resets local tap observations and ignores another account or invalid time', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a');
    tracker.recordLocalTap('a', true, 'authenticated', 'valid', 1);
    tracker.reset('b');
    tracker.recordLocalTap('a', false, 'expired', 'missing', 2);
    tracker.recordLocalTap('b', true, 'authenticated', 'valid', NaN);
    assert.equal(tracker.snapshot('b').lastLocalTapAt, null);
    assert.equal(tracker.snapshot('a').lastLocalTapAccepted, null);
  });
  it('resets on login and ignores responses from another account', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a'); tracker.record('a', state, 'read', 1);
    tracker.reset('b'); tracker.record('a', state, 'tap-accepted', 2);
    assert.equal(tracker.snapshot('b').lastResponseAt, null);
    assert.equal(tracker.snapshot('a').serverCoins, null);
    tracker.record('', state, 'read', 3);
    assert.equal(tracker.snapshot('b').lastResponseAt, null);
  });
  it('ignores older server versions, invalid observations and snapshot mutation', () => {
    const tracker = new GameDiagnostics(); tracker.reset('a'); tracker.record('a', state, 'read', 20);
    tracker.record('a', { ...state, coins: 1, version: 2 }, 'read', 10);
    tracker.record('a', { ...state, coins: NaN }, 'read', 30);
    const snapshot = tracker.snapshot('a'); snapshot.serverCoins = 999;
    assert.equal(tracker.snapshot('a').serverCoins, 125);
    assert.equal(tracker.snapshot('a').lastResponseAt, 20);
  });
});
