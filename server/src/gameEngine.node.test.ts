import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyOfflineProfit, applyTapBatch, calculateOfflineProfit, createGameState, rechargeEnergy } from './gameEngine.ts';
import { GameStorage, MemoryGameRepository, MemoryTapEventQueue } from './gameStorage.ts';
import { flushTapEvents, PostgresGameRepository, RedisBatchDeduplicator, RedisTapEventQueue, type PostgresQueries, type RedisCommands } from './productionStorage.ts';

describe('server-authoritative game engine', () => {
  it('rejects and flags an implausible tap rate', () => {
    const state = createGameState('42', 1_000);
    const result = applyTapBatch(state, { taps: 31, durationMs: 2_000, batchId: 'batch-0000000001' }, 3_000);
    assert.equal(result.flagged, true);
    assert.equal(result.acceptedTaps, 0);
    assert.equal(result.state.coins, 0);
    assert.equal(result.state.flaggedBatches, 1);
  });

  it('accepts plausible taps and spends server-owned energy', () => {
    const state = { ...createGameState('42', 1_000), energy: 10, profitPerTap: 3 };
    const result = applyTapBatch(state, { taps: 8, durationMs: 1_000, batchId: 'batch-0000000002' }, 2_000);
    assert.equal(result.acceptedTaps, 8);
    assert.equal(result.state.coins, 24);
    assert.equal(result.state.energy, 2);
  });

  it('recharges exactly one energy every three seconds', () => {
    const state = { ...createGameState('42', 1_000), energy: 10 };
    assert.equal(rechargeEnergy(state, 3_999).energy, 10);
    assert.equal(rechargeEnergy(state, 4_000).energy, 11);
    assert.equal(rechargeEnergy(state, 10_000).energy, 13);
  });

  it('caps offline profit at three hours', () => {
    assert.equal(calculateOfflineProfit(1_000, 10 * 3_600_000), 3_000);
    const state = { ...createGameState('42', 0), profitPerHour: 1_000, lastSeenAt: 0 };
    assert.equal(applyOfflineProfit(state, 90 * 60_000).offlineProfit, 1_500);
  });

  it('keeps sync traffic in the hot queue until a periodic persistence flush', async () => {
    class CountingRepository extends MemoryGameRepository { writes = 0; override async save(state: Parameters<MemoryGameRepository['save']>[0]): Promise<void> { this.writes += 1; await super.save(state); } }
    const repository = new CountingRepository();
    const queue = new MemoryTapEventQueue();
    const storage = new GameStorage(repository, queue);
    for (let index = 0; index < 2_000; index += 1) {
      const userId = String(index % 100);
      const state = await storage.stateFor(userId, index);
      storage.saveHot({ ...state, coins: state.coins + 1 });
      await queue.enqueue({ userId, batch: { taps: 1, durationMs: 1_000, batchId: `batch-${String(index).padStart(12, '0')}` }, acceptedTaps: 1, receivedAt: index });
    }
    assert.equal(queue.size(), 2_000);
    assert.equal(repository.writes, 0);
    assert.equal(await storage.flushDirty(), 100);
    assert.equal(repository.writes, 100);
  });

  it('does not rewrite state already committed by a transactional persistence service', async () => {
    class CountingRepository extends MemoryGameRepository { writes = 0; override async save(state: Parameters<MemoryGameRepository['save']>[0]): Promise<void> { this.writes += 1; await super.save(state); } }
    const repository = new CountingRepository();
    const storage = new GameStorage(repository);
    storage.saveHot(createGameState('transactional-user', Date.now()), false);
    assert.equal(await storage.flushDirty(), 0);
    assert.equal(repository.writes, 0);
  });

  it('routes load through the Redis adapter and batches PostgreSQL writes', async () => {
    class FakeRedis implements RedisCommands {
      commands = 0;
      async command<T>(parts: string[]): Promise<T> { this.commands += 1; return (parts[0] === 'LLEN' ? this.commands : 1) as T; }
    }
    class FakePostgres implements PostgresQueries {
      reads = 0;
      writes = 0;
      async query<T>(sql: string): Promise<{ rows: T[] }> {
        if (sql.startsWith('SELECT')) this.reads += 1; else this.writes += 1;
        return { rows: (sql.startsWith('SELECT') ? [] : [{ user_id: 'saved' }]) as T[] };
      }
    }
    const redis = new FakeRedis();
    const postgres = new FakePostgres();
    const storage = new GameStorage(new PostgresGameRepository(postgres), new RedisTapEventQueue(redis));
    for (let index = 0; index < 5_000; index += 1) {
      const userId = String(index % 100);
      const state = await storage.stateFor(userId, index);
      storage.saveHot({ ...state, coins: state.coins + 1 });
      await storage.queue.enqueue({ userId, batch: { taps: 1, durationMs: 1_000, batchId: `redis-${String(index).padStart(12, '0')}` }, acceptedTaps: 1, receivedAt: index });
    }
    assert.equal(redis.commands, 5_000);
    assert.equal(postgres.reads, 100);
    assert.equal(postgres.writes, 0);
    assert.equal(await storage.flushDirty(), 100);
    assert.equal(postgres.writes, 100);
  });

  it('claims a tap batch atomically in shared Redis', async () => {
    class FakeRedis implements RedisCommands { calls: string[][] = []; async command<T>(parts: string[]): Promise<T> { this.calls.push(parts); return (this.calls.length === 1 ? 'OK' : null) as T; } }
    const redis = new FakeRedis(); const batches = new RedisBatchDeduplicator(redis);
    assert.equal(await batches.claim('42', 'batch-shared-0001', Date.now()), true);
    assert.equal(await batches.claim('42', 'batch-shared-0001', Date.now()), false);
    assert.deepEqual(redis.calls[0].slice(-3), ['NX', 'PX', '600000']);
  });

  it('flushes queued tap events with conflict-safe writes', async () => {
    const queue = new MemoryTapEventQueue(); await queue.enqueue({ userId: '42', batch: { taps: 5, durationMs: 1_000, batchId: 'batch-persist-0001' }, acceptedTaps: 5, receivedAt: Date.now() });
    class CaptureDatabase implements PostgresQueries { sql = ''; async query<T>(sql: string): Promise<{ rows: T[] }> { this.sql = sql; return { rows: [] }; } }
    const database = new CaptureDatabase(); assert.equal(await flushTapEvents(queue, database), 1); assert.equal(queue.size(), 0); assert.ok(database.sql.includes('ON CONFLICT'));
  });

  it('requeues tap events when persistence fails', async () => {
    const queue = new MemoryTapEventQueue(); await queue.enqueue({ userId: '42', batch: { taps: 5, durationMs: 1_000, batchId: 'batch-retry-0001' }, acceptedTaps: 5, receivedAt: Date.now() });
    class FailingDatabase implements PostgresQueries { async query<T>(): Promise<{ rows: T[] }> { throw new Error('database unavailable'); } }
    await assert.rejects(() => flushTapEvents(queue, new FailingDatabase()), /database unavailable/); assert.equal(queue.size(), 1);
  });
});
