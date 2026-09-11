import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createGameState } from '../src/gameEngine.ts';
import { flushTapEvents, PostgresGameRepository, RedisBatchDeduplicator, RedisTapEventQueue } from '../src/productionStorage.ts';
import { runMigrations } from '../migrations.mjs';
import { PostgresGameplayPersistence } from '../src/gameplayPersistence.ts';
import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';

if (process.env.MTX_INTEGRATION_ALLOW_WRITE !== 'true') throw new Error('Set MTX_INTEGRATION_ALLOW_WRITE=true only for an isolated MTX test database and Redis namespace');
const providerPath = process.env.MTX_INFRASTRUCTURE_MODULE;
const provider = await import(providerPath ? pathToFileURL(resolve(providerPath)).href : new URL('./nodeProvider.mjs', import.meta.url).href);
const { postgres, redis } = provider;
if (!postgres?.query || !postgres?.transaction || !redis?.command) throw new Error('Provider must export postgres.query, postgres.transaction and redis.command');

const runId = randomUUID();
const userId = `integration:${runId}`;
const batchId = `integration-${runId}`;
const redisPrefix = `mtx:integration:${runId}`;

try {
  await runMigrations(postgres);

  const anomalyId = randomUUID();
  await assert.rejects(() => postgres.transaction(async (database) => { await database.query('INSERT INTO mtx_anti_cheat_anomalies (id, user_id, anomaly_type, created_at) VALUES ($1, $2, $3, NOW())', [anomalyId, userId, 'integration_rollback']); throw new Error('ROLLBACK_PROBE'); }), /ROLLBACK_PROBE/);
  const rolledBack = await postgres.query('SELECT COUNT(*)::int AS count FROM mtx_anti_cheat_anomalies WHERE id = $1', [anomalyId]);
  assert.equal(Number(rolledBack.rows[0]?.count), 0, 'PostgreSQL transaction did not roll back');

  const deduplicator = new RedisBatchDeduplicator(redis, redisPrefix);
  assert.equal(await deduplicator.claim(userId, batchId, Date.now()), true, 'Redis NX first claim failed');
  assert.equal(await deduplicator.claim(userId, batchId, Date.now()), false, 'Redis accepted a duplicate batch');

  const repository = new PostgresGameRepository(postgres);
  const initial = createGameState(userId, Date.now());
  await repository.save(initial);
  await repository.save({ ...initial, coins: 100, version: initial.version + 1 });
  await assert.rejects(() => repository.save(initial), /STATE_VERSION_CONFLICT/);
  assert.equal((await repository.get(userId))?.coins, 100, 'A stale state overwrote the current state');

  const queue = new RedisTapEventQueue(redis, `${redisPrefix}:tap-events`);
  await queue.enqueue({ userId, batch: { taps: 2, durationMs: 1_000, batchId }, acceptedTaps: 2, receivedAt: Date.now() });
  assert.equal(await flushTapEvents(queue, postgres), 1, 'Tap queue did not flush');
  const persistedTap = await postgres.query('SELECT accepted_taps FROM mtx_tap_events WHERE user_id = $1 AND batch_id = $2', [userId, batchId]);
  assert.equal(Number(persistedTap.rows[0]?.accepted_taps), 2, 'Tap event was not persisted');

  const now = Date.now();
  process.stdout.write('MTX_CHECK concurrent duplicate and 20 distinct tap batches\n');
  const first = new PostgresGameplayPersistence(postgres, redis);
  const second = new PostgresGameplayPersistence(postgres, redis);
  const sameBatch = { batchId: randomUUID(), taps: 3, durationMs: 1000 };
  const copies = await Promise.all([first.applyTaps(userId, sameBatch, now), second.applyTaps(userId, sameBatch, now)]);
  assert.equal(copies.filter((result) => !result.duplicate).length, 1, 'Concurrent copies credited twice');
  assert.equal((await repository.get(userId))?.coins, 103);
  await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).applyTaps(userId, { batchId: randomUUID(), taps: 2, durationMs: 1000 }, now)));
  assert.equal((await repository.get(userId))?.coins, 143, 'Concurrent batches overwrote each other');

  const rollbackBatch = { batchId: randomUUID(), taps: 5, durationMs: 1000 };
  const retryTime = now + 1000;
  process.stdout.write('MTX_CHECK rollback before commit\n');
  const rollbackDatabase = {
    query: (sql, values) => postgres.query(sql, values),
    transaction: (operation) => postgres.transaction(async (database) => { await operation(database); throw new Error('BEFORE_COMMIT'); }),
  };
  await assert.rejects(new PostgresGameplayPersistence(rollbackDatabase, redis).applyTaps(userId, rollbackBatch, retryTime), /BEFORE_COMMIT/);
  assert.equal((await repository.get(userId))?.coins, 143);
  const rollbackReceipt = await postgres.query('SELECT COUNT(*)::int AS count FROM mtx_tap_receipts WHERE user_id = $1 AND batch_id = $2', [userId, rollbackBatch.batchId]);
  assert.equal(Number(rollbackReceipt.rows[0]?.count), 0);
  assert.equal((await first.applyTaps(userId, rollbackBatch, retryTime)).state.coins, 148);

  const uncertainBatch = { batchId: randomUUID(), taps: 5, durationMs: 1000 };
  process.stdout.write('MTX_CHECK lost commit response and replay after restart\n');
  const uncertainDatabase = {
    query: (sql, values) => postgres.query(sql, values),
    transaction: async (operation) => { await postgres.transaction(operation); throw new Error('RESPONSE_LOST_AFTER_COMMIT'); },
  };
  await assert.rejects(new PostgresGameplayPersistence(uncertainDatabase, redis).applyTaps(userId, uncertainBatch, retryTime), /RESPONSE_LOST_AFTER_COMMIT/);
  const restarted = new PostgresGameplayPersistence(postgres, redis);
  const replay = await restarted.applyTaps(userId, uncertainBatch, now + 86_400_000);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.state.coins, 153, 'A lost commit response caused duplicate credit on retry');

  const beforeOffline = await repository.get(userId);
  process.stdout.write('MTX_CHECK concurrent offline income\n');
  await repository.save({ ...beforeOffline, profitPerHour: 1000, version: beforeOffline.version + 1 });
  const offlineTime = beforeOffline.lastSeenAt + 3_600_000;
  const offline = await Promise.all([first.creditOffline(userId, offlineTime, ECONOMY_CONFIG), restarted.creditOffline(userId, offlineTime, ECONOMY_CONFIG)]);
  assert.equal(offline.reduce((total, result) => total + result.offlineProfit, 0), 1000, 'Offline income credited more than once');
  assert.equal((await repository.get(userId))?.coins, 1153);
  const receiptCount = await postgres.query('SELECT COUNT(*)::int AS count FROM mtx_tap_receipts WHERE user_id = $1', [userId]);
  const eventCount = await postgres.query('SELECT COUNT(*)::int AS count FROM mtx_tap_events WHERE user_id = $1', [userId]);
  assert.equal(Number(receiptCount.rows[0]?.count), 23, 'Receipt count is not exactly one per unique batch');
  assert.equal(Number(eventCount.rows[0]?.count), 24, 'Audit count contains a duplicate or a rolled-back event');

  process.stdout.write('MTX_CHECK shared server-time tap budget and retry after throttling\n');
  const bursts = [randomUUID(), randomUUID()].map((id) => ({ taps: 50, durationMs: 10000, batchId: id }));
  const budgetResults = await Promise.allSettled([first.applyTaps(userId, bursts[0], offlineTime), second.applyTaps(userId, bursts[1], offlineTime)]);
  assert.equal(budgetResults.filter((result) => result.status === 'fulfilled').length, 1);
  const deferredIndex = budgetResults.findIndex((result) => result.status === 'rejected');
  assert.match(budgetResults[deferredIndex].reason.message, /TAP_RATE_LIMITED/);
  const deferredReceipt = await postgres.query('SELECT COUNT(*)::int AS count FROM mtx_tap_receipts WHERE user_id = $1 AND batch_id = $2', [userId, bursts[deferredIndex].batchId]);
  assert.equal(Number(deferredReceipt.rows[0]?.count), 0, 'Throttling must not consume the batch receipt');
  assert.equal((await repository.get(userId))?.coins, 1203);
  const deferredRetry = await restarted.applyTaps(userId, bursts[deferredIndex], offlineTime + 3334);
  assert.equal(deferredRetry.state.coins, 1253); assert.equal(deferredRetry.duplicate, false);

  process.stdout.write('MTX real infrastructure integration checks passed\n');
} finally {
  await postgres.query('DELETE FROM mtx_tap_receipts WHERE user_id = $1', [userId]).catch(() => undefined);
  await postgres.query('DELETE FROM mtx_tap_events WHERE user_id = $1', [userId]).catch(() => undefined);
  await postgres.query('DELETE FROM mtx_game_state WHERE user_id = $1', [userId]).catch(() => undefined);
  await postgres.query('DELETE FROM mtx_anti_cheat_anomalies WHERE user_id = $1', [userId]).catch(() => undefined);
  await redis.command(['DEL', `${redisPrefix}:${userId}:${batchId}`, `${redisPrefix}:tap-events`]).catch(() => undefined);
  await provider.close?.();
}
