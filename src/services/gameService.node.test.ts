import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_GAME_STATE } from '../constants/game.ts';
import { getRechargeInterval, getUpgradeQuote, progress } from './gameService.ts';

const state = { ...DEFAULT_GAME_STATE, boostHistory: [] };
describe('game service', () => {
  it('returns the first energy quote', () => assert.deepEqual(getUpgradeQuote('energy', state), { cost: 750, value: 1500 }));
  it('returns the first tap quote', () => assert.deepEqual(getUpgradeQuote('tap', state), { cost: 1000, value: 2 }));
  it('uses the slow recharge tier near full energy', () => assert.equal(getRechargeInterval({ energy: 700, maxEnergy: 750, energyLevel: 0 }), 3200));
  it('clamps progress', () => { assert.equal(progress(-1, 4), 0); assert.equal(progress(5, 4), 100); });
});
