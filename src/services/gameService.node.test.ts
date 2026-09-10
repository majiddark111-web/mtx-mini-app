import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_GAME_STATE } from '../constants/game.ts';
import { getUpgradeQuote, progress, reconciledTapState, withPendingTaps } from './gameService.ts';
import { acknowledgeTapBatch, appendTap, loadTapOutbox, nextTapBatch, sealActiveBatch, tapBatchDuration, type TapOutboxStorage } from './tapOutboxService.ts';

const state = { ...DEFAULT_GAME_STATE, boostHistory: [] };
describe('game service', () => {
  it('returns the first energy quote', () => assert.deepEqual(getUpgradeQuote('energy', state), { cost: 750, value: 1500 }));
  it('returns the first tap quote', () => assert.deepEqual(getUpgradeQuote('tap', state), { cost: 1000, value: 2 }));
  it('clamps progress', () => { assert.equal(progress(-1, 4), 0); assert.equal(progress(5, 4), 100); });
  it('keeps unsynced taps visible while applying an authoritative state', () => assert.deepEqual(withPendingTaps({ coins: 100, energy: 20, maximumEnergy: 1_000, profitPerTap: 2, profitPerHour: 0, version: 2 }, 3), { coins: 106, energy: 17, maximumEnergy: 1_000, profitPerTap: 2, profitPerHour: 0, version: 2 }));

  it('keeps an unsent tap batch across reloads with the same id', () => {
    class MemoryStorage implements TapOutboxStorage { values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }
    const storage = new MemoryStorage(); const id = '11111111-1111-4111-8111-111111111111'; appendTap(storage, '42', 1_000, id); appendTap(storage, '42', 1_150, '22222222-2222-4222-8222-222222222222'); sealActiveBatch(storage, '42', 3_000);
    const afterReload = nextTapBatch(storage, '42'); assert.equal(afterReload?.batchId, id); assert.equal(afterReload?.taps, 2); assert.equal(afterReload && tapBatchDuration(afterReload, 3_000), 2_000);
    assert.equal(loadTapOutbox(storage, '42').length, 1); acknowledgeTapBatch(storage, '42', id); assert.equal(loadTapOutbox(storage, '42').length, 0);
  });

  it('does not expose an active batch until it is sealed for sync', () => {
    class MemoryStorage implements TapOutboxStorage { value: string | null = null; getItem() { return this.value; } setItem(_key: string, value: string) { this.value = value; } }
    const storage = new MemoryStorage(); appendTap(storage, '42', 1_000, '33333333-3333-4333-8333-333333333333'); assert.equal(nextTapBatch(storage, '42'), undefined); sealActiveBatch(storage, '42'); assert.equal(nextTapBatch(storage, '42')?.taps, 1);
  });

  it('keeps the original duration across retries and reloads', () => {
    class MemoryStorage implements TapOutboxStorage { value: string | null = null; getItem() { return this.value; } setItem(_key: string, value: string) { this.value = value; } }
    const storage = new MemoryStorage();
    appendTap(storage, '42', 1_000, '33333333-3333-4333-8333-333333333333');
    sealActiveBatch(storage, '42', 3_000);
    sealActiveBatch(storage, '42', 60_000);
    const batch = nextTapBatch(storage, '42')!;
    assert.equal(tapBatchDuration(batch, 60_000), 2_000);
    assert.equal(tapBatchDuration(batch, 86_400_000), 2_000);
    assert.equal(loadTapOutbox(storage, '42').length, 1, 'reading/retrying must not acknowledge the batch');
  });

  it('freezes a full batch when the last tap arrives', () => {
    class MemoryStorage implements TapOutboxStorage { value: string | null = null; getItem() { return this.value; } setItem(_key: string, value: string) { this.value = value; } }
    const storage = new MemoryStorage();
    for (let index = 0; index < 50; index += 1) appendTap(storage, '42', 1_000 + index * 100);
    assert.equal(tapBatchDuration(nextTapBatch(storage, '42')!, 60_000), 4_900);
  });

  it('uses a stable duration for sealed batches saved by the previous client', () => {
    const batch = { batchId: '33333333-3333-4333-8333-333333333333', taps: 2, startedAt: 1000, lastTapAt: 1500, sealed: true };
    assert.equal(tapBatchDuration(batch, 3000), 500);
    assert.equal(tapBatchDuration(batch, 60_000), 500);
  });

  it('reconciles confirmed acceptance/rejection but never acknowledges errors or malformed state', () => {
    const state = { coins: 10, energy: 990, maximumEnergy: 1000, profitPerTap: 1, profitPerHour: 0, tapLevel: 0, energyLevel: 0, profitLevel: 0, version: 2 };
    assert.deepEqual(reconciledTapState(200, { state }), state);
    assert.deepEqual(reconciledTapState(422, { state, flagged: true }), state);
    for (const status of [401, 409, 429, 500, 503]) assert.throws(() => reconciledTapState(status, { state }), /Invalid tap sync/);
    assert.throws(() => reconciledTapState(422, { state }), /Invalid tap sync/);
    assert.throws(() => reconciledTapState(200, { state: {} }), /Invalid tap sync/);
    assert.throws(() => reconciledTapState(200, null), /Invalid tap sync/);
  });
});
