import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';
import { effectiveProfitPerHour, expectedDailyIncome, upgradeCost, upgradeQuote, upgradeValue } from '../../economy/economyService.ts';
import { loadEconomyConfig } from './economyConfigProvider.ts';
import type { Env } from './types.ts';

describe('economy balance', () => {
  it('uses exponential costs and increasing upgrade values', () => {
    assert.equal(upgradeQuote('tap', 0)?.cost, 1_000);
    assert.equal(upgradeQuote('tap', 0)?.value, 2);
    assert.ok(upgradeCost('tap', 10) > upgradeCost('tap', 9));
    assert.ok(upgradeValue('profit', 10) > upgradeValue('profit', 9));
  });

  it('stops selling upgrades at their configured maximum level', () => {
    assert.equal(upgradeQuote('tap', ECONOMY_CONFIG.upgrades.tap.maximumLevel), null);
    assert.equal(upgradeQuote('energy', ECONOMY_CONFIG.upgrades.energy.maximumLevel), null);
    assert.equal(upgradeQuote('profit', ECONOMY_CONFIG.upgrades.profit.maximumLevel), null);
  });

  it('applies diminishing returns and the hard profit-per-hour cap', () => {
    assert.equal(effectiveProfitPerHour(100_000), 100_000);
    assert.equal(effectiveProfitPerHour(200_000), 135_000);
    assert.equal(effectiveProfitPerHour(1_000_000), 250_000);
  });

  it('keeps expected daily income ordered by engagement stage', () => {
    const starter = expectedDailyIncome('starter', 1, 100);
    const active = expectedDailyIncome('active', 2, 1_000);
    const power = expectedDailyIncome('power', 5, 10_000);
    assert.ok(starter < active);
    assert.ok(active < power);
    assert.equal(starter, 2_500);
    assert.equal(power, 93_500);
  });

  it('caps external daily reward sources', () => {
    assert.ok(ECONOMY_CONFIG.dailyScenarios.power.missionIncome <= ECONOMY_CONFIG.sources.missions.dailyRewardCap);
    assert.ok(ECONOMY_CONFIG.dailyScenarios.power.referralIncome <= ECONOMY_CONFIG.sources.referrals.dailyRewardCap);
    assert.equal(ECONOMY_CONFIG.sinks.upgradeBurnRate, 1);
  });

  it('loads a versioned runtime configuration without a redeploy', async () => {
    const runtime = structuredClone(ECONOMY_CONFIG) as unknown as typeof ECONOMY_CONFIG;
    const serialized = JSON.stringify({ ...runtime, version: 2, inflation: { ...runtime.inflation, profitPerHourSoftCap: 80_000 } });
    const env = { ECONOMY_CONFIG: { async get() { return serialized; } } } as Env;
    const loaded = await loadEconomyConfig(env);
    assert.equal(loaded.version, 2);
    assert.equal(loaded.inflation.profitPerHourSoftCap, 80_000);
  });
});
