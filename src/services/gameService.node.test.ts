import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_GAME_STATE } from '../constants/game.ts';
import { getRechargeInterval, getUpgradeQuote, progress } from './gameService.ts';
import { acknowledgeTapBatch, appendTap, loadTapOutbox, nextTapBatch, sealActiveBatch, tapBatchDuration, type TapOutboxStorage } from './tapOutboxService.ts';

const state = { ...DEFAULT_GAME_STATE, boostHistory: [] };
describe('game service', () => {
  it('returns the first energy quote', () => assert.deepEqual(getUpgradeQuote('energy', state), { cost: 750, value: 1500 }));
  it('returns the first tap quote', () => assert.deepEqual(getUpgradeQuote('tap', state), { cost: 1000, value: 2 }));
  it('uses the slow recharge tier near full energy', () => assert.equal(getRechargeInterval({ energy: 700, maxEnergy: 750, energyLevel: 0 }), 3200));
  it('clamps progress', () => { assert.equal(progress(-1, 4), 0); assert.equal(progress(5, 4), 100); });

  it('keeps an unsent tap batch across reloads with the same id', () => {
    class MemoryStorage implements TapOutboxStorage { values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }
    const storage = new MemoryStorage(); const id = '11111111-1111-4111-8111-111111111111'; appendTap(storage, '42', 1_000, id); appendTap(storage, '42', 1_150, '22222222-2222-4222-8222-222222222222'); sealActiveBatch(storage, '42');
    const afterReload = nextTapBatch(storage, '42'); assert.equal(afterReload?.batchId, id); assert.equal(afterReload?.taps, 2); assert.equal(afterReload && tapBatchDuration(afterReload), 150);
    assert.equal(loadTapOutbox(storage, '42').length, 1); acknowledgeTapBatch(storage, '42', id); assert.equal(loadTapOutbox(storage, '42').length, 0);
  });

  it('does not expose an active batch until it is sealed for sync', () => {
    class MemoryStorage implements TapOutboxStorage { value: string | null = null; getItem() { return this.value; } setItem(_key: string, value: string) { this.value = value; } }
    const storage = new MemoryStorage(); appendTap(storage, '42', 1_000, '33333333-3333-4333-8333-333333333333'); assert.equal(nextTapBatch(storage, '42'), undefined); sealActiveBatch(storage, '42'); assert.equal(nextTapBatch(storage, '42')?.taps, 1);
  });
});
