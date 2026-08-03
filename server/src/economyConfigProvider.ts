import { ECONOMY_CONFIG, type EconomyConfig } from '../../economy/economyConfig.ts';
import type { Env } from './types.ts';

function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }

export async function loadEconomyConfig(env: Env): Promise<EconomyConfig> {
  const serialized = await env.ECONOMY_CONFIG?.get('active');
  if (!serialized) return ECONOMY_CONFIG;
  const value = JSON.parse(serialized) as EconomyConfig;
  const upgrades = value.upgrades && [value.upgrades.tap, value.upgrades.energy, value.upgrades.profit];
  const validUpgrades = upgrades && upgrades.every((upgrade) => positive(upgrade?.baseCost) && positive(upgrade?.costGrowth) && positive(upgrade?.maximumLevel));
  const scenarios = value.dailyScenarios && Object.values(value.dailyScenarios);
  const validScenarios = scenarios && scenarios.length === 3 && scenarios.every((scenario) => scenario && scenario.creditedTaps >= 0 && scenario.missionIncome >= 0 && scenario.referralIncome >= 0 && scenario.offlineHours >= 0);
  if (!positive(value.version) || value.currency !== 'MTX' || !positive(value.sources?.tap?.baseProfit) || !positive(value.sources?.tap?.dailyCreditedTapCap) || !positive(value.sources?.offline?.capHours) || !positive(value.sources?.missions?.dailyRewardCap) || !positive(value.sources?.referrals?.dailyRewardCap) || !positive(value.inflation?.profitPerHourSoftCap) || !positive(value.inflation?.maximumEffectiveProfitPerHour) || !validUpgrades || !validScenarios) throw new Error('Invalid economy configuration');
  return value;
}
