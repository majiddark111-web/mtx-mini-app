import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyOfflineProfit, applyTapBatch, calculateOfflineProfit, createGameState } from './gameEngine.ts';
import { GameStorage, MemoryGameRepository, MemoryTapEventQueue } from './gameStorage.ts';

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
    assert.equal(result.state.energy, 3);
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
});
