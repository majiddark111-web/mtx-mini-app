import assert from 'node:assert/strict';
import test from 'node:test';
import { achievementsFor } from './achievements.ts';
import { createGameState } from './gameEngine.ts';

test('derives achievement progress only from server-owned data', () => {
  const state = { ...createGameState('player', 1), xp: 120, level: 5, tapLevel: 2, energyLevel: 2, profitLevel: 1 };
  const badges = achievementsFor(state, 3, 2);
  assert.equal(badges.find((item) => item.id === 'tap-rookie')?.unlocked, true);
  assert.equal(badges.find((item) => item.id === 'power-builder')?.unlocked, true);
  assert.equal(badges.find((item) => item.id === 'collector')?.unlocked, true);
  assert.equal(badges.find((item) => item.id === 'connector')?.unlocked, false);
});

test('caps visible achievement progress at its target', () => {
  const state = { ...createGameState('player', 1), xp: 20_000 };
  const rookie = achievementsFor(state, 0, 0).find((item) => item.id === 'tap-rookie');
  assert.equal(rookie?.progress, 100);
});
