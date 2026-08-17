import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';
import { resolve } from 'node:path';
import { createGameState } from '../src/gameEngine.ts';
import { flushTapEvents, PostgresGameRepository, RedisBatchDeduplicator, RedisTapEventQueue } from '../src/productionStorage.ts';

if (process.env.MTX_INTEGRATION_ALLOW_WRITE !== 'true') throw new Error('Set MTX_INTEGRATION_ALLOW_WRITE=true only for an isolated MTX test database and Redis namespace');
const providerPath = process.env.MTX_INFRASTRUCTURE_MODULE;
if (!providerPath) throw new Error('MTX_INFRASTRUCTURE_MODULE must point to a local provider module exporting postgres and redis adapters');

const provider = await import(pathToFileURL(resolve(providerPath)).href);
const { postgres, redis } = provider;
if (!postgres?.query || !postgres?.transaction || !redis?.command) throw new Error('Provider must export postgres.query, postgres.transaction and redis.command');

const runId = randomUUID();
const userId = `integration:${runId}`;
const batchId = `integration-${runId}`;
const redisPrefix = `mtx:integration:${runId}`;

try {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await postgres.query(schema, []);

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

  process.stdout.write('MTX real infrastructure integration checks passed\n');
} finally {
  await postgres.query('DELETE FROM mtx_tap_events WHERE user_id = $1', [userId]).catch(() => undefined);
  await postgres.query('DELETE FROM mtx_game_state WHERE user_id = $1', [userId]).catch(() => undefined);
  await postgres.query('DELETE FROM mtx_anti_cheat_anomalies WHERE user_id = $1', [userId]).catch(() => undefined);
  await redis.command(['DEL', `${redisPrefix}:${userId}:${batchId}`, `${redisPrefix}:tap-events`]).catch(() => undefined);
  await provider.close?.();
}
