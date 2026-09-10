import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOfflineProfit, applyTapBatch, createGameState } from './gameEngine.ts';
import { GameStorage, MemoryGameRepository } from './gameStorage.ts';
import { SocialStorage } from './social.ts';
import { CommerceStorage } from './commerce.ts';

const now = Date.UTC(2026, 8, 13, 23, 59, 59);
const taps = (count: number, at = now) => applyTapBatch(createGameState('period-user', at), { taps: count, durationMs: count * 100, batchId: 'period-test' }, at).state;

test('daily progress resets at UTC midnight without carrying lifetime XP', async () => {
  const social = new SocialStorage();
  const state = taps(500);
  assert.equal((await social.missions(state.userId, state, now))[0].progress, 500);
  assert.equal((await social.missions(state.userId, state, now + 1000))[0].progress, 0);
});

test('spending coins does not remove gameplay earnings from weekly progress', async () => {
  const state = applyTapBatch({ ...createGameState('period-user', now), profitPerTap: 1000 }, { taps: 10, durationMs: 1000, batchId: 'weekly' }, now).state;
  const spent = { ...state, coins: 0, version: state.version + 1 };
  const social = new SocialStorage();
  assert.equal((await social.missions(state.userId, spent, now))[1].progress, 10_000);
  assert.equal((await social.missions(state.userId, spent, now + 1000))[1].progress, 0);
});

test('old balances and XP without period records cannot unlock new rewards', async () => {
  const state = { ...createGameState('legacy', now), xp: 50_000, coins: 100_000, level: 23 };
  assert.deepEqual((await new SocialStorage().missions(state.userId, state, now)).map((item) => item.progress), [0, 0, 0]);
});

test('monthly mission requires newly gained levels and resets at month boundary', async () => {
  const at = Date.UTC(2026, 8, 30, 23, 59, 59);
  const state = applyTapBatch({ ...createGameState('level-user', at), energy: 20_000, maximumEnergy: 20_000 }, { taps: 10_000, durationMs: 1_000_000, batchId: 'levels' }, at).state;
  assert.equal((await new SocialStorage().missions(state.userId, state, at))[2].progress, 10);
  assert.equal((await new SocialStorage().missions(state.userId, state, at + 1000))[2].progress, 0);
});

test('period progress survives storage reload and viewing missions does not change it', async () => {
  const repository = new MemoryGameRepository();
  const first = new GameStorage(repository);
  first.saveHot(taps(123));
  await first.flushDirty();
  const restarted = new GameStorage(repository);
  const state = await restarted.stateFor('period-user', now);
  const before = structuredClone(state);
  assert.equal((await new SocialStorage().missions(state.userId, state, now))[0].progress, 123);
  assert.deepEqual(state, before);
});

test('invalid batches and purchased coins do not advance gameplay missions', async () => {
  const game = new GameStorage();
  const initial = await game.stateFor('period-user', now);
  game.saveHot(applyTapBatch(initial, { taps: 500, durationMs: 1000, batchId: 'invalid' }, now).state);
  await new CommerceStorage().recordPayment({ transactionId: 'test-only', userId: initial.userId, provider: 'ton', asset: 'TON', amount: 1, creditedCoins: 10_000, status: 'confirmed', createdAt: now }, game, now);
  const missions = await new SocialStorage().missions(initial.userId, await game.stateFor(initial.userId, now), now);
  assert.equal(missions[0].progress, 0);
  assert.equal(missions[1].progress, 0);
});

test('offline income counts once in the period it is credited', async () => {
  const initial = { ...createGameState('offline-user', now), profitPerHour: 1000 };
  const at = now + 3_600_000;
  const first = applyOfflineProfit(initial, at).state;
  const repeated = applyOfflineProfit(first, at).state;
  assert.equal((await new SocialStorage().missions(initial.userId, repeated, at))[1].progress, 1000);
});

test('a completed daily mission cannot be claimed twice or again tomorrow without activity', async () => {
  const social = new SocialStorage();
  const game = new GameStorage(); game.saveHot(taps(500));
  const results = await Promise.allSettled([social.claimMission('period-user', 'daily-taps', game, now), social.claimMission('period-user', 'daily-taps', game, now)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await game.stateFor('period-user', now)).coins, 800);
  await assert.rejects(social.claimMission('period-user', 'daily-taps', game, now + 1000), /MISSION_UNAVAILABLE/);
});
