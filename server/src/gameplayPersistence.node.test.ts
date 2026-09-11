import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresGameplayPersistence } from './gameplayPersistence.ts';
import { PostgresGameRepository, productionGameStorage, type PostgresQueries, type RedisCommands } from './productionStorage.ts';
import { createGameState, type ServerGameState } from './gameEngine.ts';
import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';

interface Receipt { taps: number; accepted_taps: number; flagged: boolean; }
// Models atomic commit/rollback and the per-row lock. Live PostgreSQL checks live
// in server/integration/run.mjs; this double does not prove database isolation.
class TransactionDatabase implements PostgresQueries {
  states = new Map<string, ServerGameState>();
  receipts = new Map<string, Receipt>();
  events = new Map<string, { taps: number; accepted_taps: number }>();
  failBeforeCommit = false;
  loseCommitResponse = false;
  private tail: Promise<unknown> = Promise.resolve();
  async query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }> {
    const id = String(values[0]); const key = `${id}:${values[1]}`;
    if (sql.startsWith('INSERT INTO mtx_game_state')) { if (!this.states.has(id)) this.states.set(id, JSON.parse(String(values[1]))); return { rows: [] }; }
    if (sql.startsWith('SELECT state FROM')) return { rows: (this.states.has(id) ? [{ state: structuredClone(this.states.get(id)) }] : []) as T[] };
    if (sql.startsWith('SELECT taps, accepted_taps, flagged')) return { rows: (this.receipts.has(key) ? [this.receipts.get(key)] : []) as T[] };
    if (sql.startsWith('SELECT taps, accepted_taps FROM')) return { rows: (this.events.has(key) ? [this.events.get(key)] : []) as T[] };
    if (sql.startsWith('INSERT INTO mtx_tap_receipts')) { assert.ok(!this.receipts.has(key)); this.receipts.set(key, { taps: Number(values[2]), accepted_taps: Number(values[3]), flagged: Boolean(values[4]) }); return { rows: [] }; }
    if (sql.startsWith('UPDATE mtx_game_state')) { this.states.set(id, JSON.parse(String(values[1]))); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO mtx_tap_events')) { this.events.set(key, { taps: Number(values[2]), accepted_taps: Number(values[3]) }); return { rows: [] }; }
    throw new Error(`Unexpected test SQL: ${sql}`);
  }
  transaction<T>(operation: (db: PostgresQueries) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const before = structuredClone({ states: this.states, receipts: this.receipts, events: this.events });
      let result: T;
      try {
        result = await operation(this);
        if (this.failBeforeCommit) { this.failBeforeCommit = false; throw new Error('COMMIT_FAILED'); }
      } catch (error) { Object.assign(this, before); throw error; }
      if (this.loseCommitResponse) { this.loseCommitResponse = false; throw new Error('CONNECTION_LOST_AFTER_COMMIT'); }
      return result;
    });
    this.tail = run.catch(() => undefined); return run;
  }
}
const now = Date.UTC(2026, 8, 15, 12);
const batch = { batchId: 'durable-batch-0001', taps: 5, durationMs: 1000 };

test('a failed transaction rolls back coins, receipt and audit event before retry', async () => {
  const db = new TransactionDatabase(); const service = new PostgresGameplayPersistence(db);
  db.failBeforeCommit = true;
  await assert.rejects(service.applyTaps('42', batch, now), /COMMIT_FAILED/);
  assert.equal(db.states.size, 0); assert.equal(db.receipts.size, 0); assert.equal(db.events.size, 0);
  assert.equal((await service.applyTaps('42', batch, now)).state.coins, 5);
});

test('lost commit response and restart cannot double-credit a batch even after ten minutes', async () => {
  const db = new TransactionDatabase(); db.loseCommitResponse = true;
  await assert.rejects(new PostgresGameplayPersistence(db).applyTaps('42', batch, now), /CONNECTION_LOST/);
  const retry = await new PostgresGameplayPersistence(db).applyTaps('42', batch, now + 86_400_000);
  assert.equal(retry.duplicate, true); assert.equal(retry.state.coins, 5);
  assert.equal(db.events.size, 1); assert.equal(db.receipts.size, 1);
});

test('two instances serialize distinct batches and reject reuse with changed taps', async () => {
  const db = new TransactionDatabase();
  await Promise.all([new PostgresGameplayPersistence(db).applyTaps('42', batch, now), new PostgresGameplayPersistence(db).applyTaps('42', { ...batch, batchId: 'durable-batch-0002' }, now)]);
  assert.equal(db.states.get('42')?.coins, 10);
  await assert.rejects(new PostgresGameplayPersistence(db).applyTaps('42', { ...batch, taps: 6 }, now), /IDEMPOTENCY_KEY_REUSED/);
  assert.equal(db.states.get('42')?.coins, 10);
});

test('two simultaneous copies of one batch produce one credit', async () => {
  const db = new TransactionDatabase();
  const results = await Promise.all([new PostgresGameplayPersistence(db).applyTaps('42', batch, now), new PostgresGameplayPersistence(db).applyTaps('42', batch, now)]);
  assert.deepEqual(results.map((result) => result.duplicate), [false, true]);
  assert.equal(db.states.get('42')?.coins, 5);
});

test('concurrent offline requests credit income once and never move time backwards', async () => {
  const db = new TransactionDatabase(); db.states.set('42', { ...createGameState('42', now), profitPerHour: 1000 });
  const service = new PostgresGameplayPersistence(db);
  const results = await Promise.all([service.creditOffline('42', now + 3_600_000, ECONOMY_CONFIG), service.creditOffline('42', now + 3_600_000, ECONOMY_CONFIG)]);
  assert.equal(results.reduce((sum, result) => sum + result.offlineProfit, 0), 1000);
  await service.creditOffline('42', now, ECONOMY_CONFIG);
  assert.equal(db.states.get('42')?.lastSeenAt, now + 3_600_000);
});

test('production reads latest state rather than a stale process cache', async () => {
  const db = new TransactionDatabase(); const redis: RedisCommands = { async command<T>() { return null as T; } };
  const first = productionGameStorage(redis, db); const second = productionGameStorage(redis, db);
  await first.stateFor('42', now); await second.applyTaps('42', batch, now);
  assert.equal((await first.stateFor('42', now)).coins, 5);
  assert.equal(await first.flushDirty(), 0);
  assert.equal((await new PostgresGameRepository(db).get('42'))?.coins, 5);
});

test('legacy audit events protect pre-upgrade batches against replay', async () => {
  const db = new TransactionDatabase(); db.states.set('42', { ...createGameState('42', now), coins: 99 });
  db.events.set(`42:${batch.batchId}`, { taps: 5, accepted_taps: 5 });
  const result = await new PostgresGameplayPersistence(db).applyTaps('42', batch, now);
  assert.equal(result.duplicate, true); assert.equal(result.state.coins, 99);
});

test('a rejected batch stays rejected on retry and does not keep adding flags', async () => {
  const db = new TransactionDatabase(); const service = new PostgresGameplayPersistence(db);
  const invalid = { ...batch, taps: 50, durationMs: 100 };
  assert.equal((await service.applyTaps('42', invalid, now)).flagged, true);
  const retry = await service.applyTaps('42', { ...invalid, durationMs: 10000 }, now + 10000);
  assert.equal(retry.flagged, true); assert.equal(retry.state.coins, 0); assert.equal(retry.state.flaggedBatches, 1);
});

test('two instances cannot turn forged durations into an unlimited simultaneous tap burst', async () => {
  const db = new TransactionDatabase();
  const first = new PostgresGameplayPersistence(db); const second = new PostgresGameplayPersistence(db);
  const full = { batchId: 'server-budget-first', taps: 50, durationMs: 10000 };
  const deferred = { ...full, batchId: 'server-budget-second' };
  const results = await Promise.allSettled([first.applyTaps('42', full, now), second.applyTaps('42', deferred, now)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.match(rejected?.reason.message, /TAP_RATE_LIMITED/);
  assert.equal(db.states.get('42')?.coins, 50);
  assert.equal(db.receipts.size, 1); assert.equal(db.events.size, 1);
  assert.equal(db.states.get('42')?.flaggedBatches, 0, 'transport bursts are not proof of cheating');
  const retried = await second.applyTaps('42', deferred, now + 3334);
  assert.equal(retried.state.coins, 100);
  assert.equal(retried.duplicate, false, 'a throttled batch must remain retryable');
});

test('committed batch replays and process restarts do not reset or spend the shared tap budget', async () => {
  const db = new TransactionDatabase(); const full = { batchId: 'server-budget-full', taps: 50, durationMs: 10000 };
  db.loseCommitResponse = true;
  await assert.rejects(new PostgresGameplayPersistence(db).applyTaps('42', full, now), /CONNECTION_LOST/);
  const restarted = new PostgresGameplayPersistence(db);
  assert.equal((await restarted.applyTaps('42', full, now)).duplicate, true);
  await assert.rejects(restarted.applyTaps('42', { ...batch, taps: 1 }, now), /TAP_RATE_LIMITED/);
  assert.equal((await restarted.applyTaps('42', { ...batch, taps: 15 }, now + 1000)).state.coins, 65);
});

test('server time replenishes 15 taps per second and idle allowance remains bounded', async () => {
  const db = new TransactionDatabase(); const service = new PostgresGameplayPersistence(db);
  await service.applyTaps('42', { ...batch, taps: 50, durationMs: 10000 }, now);
  for (let second = 1; second <= 10; second += 1) {
    await service.applyTaps('42', { taps: 15, durationMs: 10000, batchId: 'server-second-' + second }, now + second * 1000);
    await assert.rejects(service.applyTaps('42', { taps: 1, durationMs: 10000, batchId: 'server-excess-' + second }, now + second * 1000), /TAP_RATE_LIMITED/);
  }
  assert.equal(db.states.get('42')?.coins, 200);
  await service.applyTaps('42', { taps: 50, durationMs: 10000, batchId: 'after-long-idle' }, now + 86_400_000);
  await assert.rejects(service.applyTaps('42', { taps: 1, durationMs: 10000, batchId: 'extra-after-idle' }, now + 86_400_000), /TAP_RATE_LIMITED/);
});

test('offline reads and backwards server timestamps cannot reset the tap allowance', async () => {
  const db = new TransactionDatabase(); const service = new PostgresGameplayPersistence(db);
  await service.applyTaps('42', { ...batch, taps: 50, durationMs: 10000 }, now);
  await service.creditOffline('42', now, ECONOMY_CONFIG);
  await assert.rejects(service.applyTaps('42', { ...batch, batchId: 'after-state-read', taps: 1 }, now - 1000), /TAP_RATE_LIMITED/);
  assert.equal(db.states.get('42')?.coins, 50);
});
