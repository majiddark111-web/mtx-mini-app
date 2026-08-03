import { ECONOMY_CONFIG, type EconomyConfig, type EconomyUpgradeType } from './economyConfig.ts';

export interface EconomyQuote { cost: number; value: number; level: number; }

export function upgradeCost(type: EconomyUpgradeType, currentLevel: number): number {
  const config = ECONOMY_CONFIG.upgrades[type];
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 0 || currentLevel >= config.maximumLevel) return 0;
  return Math.ceil(config.baseCost * config.costGrowth ** currentLevel);
}

export function upgradeValue(type: EconomyUpgradeType, level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  if (type === 'profit') {
    const profit = ECONOMY_CONFIG.upgrades.profit;
    return safeLevel === 0 ? profit.baseValue : Math.floor(profit.valueStep * profit.valueGrowth ** (safeLevel - 1));
  }
  const config = type === 'tap' ? ECONOMY_CONFIG.upgrades.tap : ECONOMY_CONFIG.upgrades.energy;
  return config.baseValue + config.valuePerLevel * safeLevel;
}

export function upgradeQuote(type: EconomyUpgradeType, currentLevel: number): EconomyQuote | null {
  const cost = upgradeCost(type, currentLevel);
  return cost === 0 ? null : { cost, value: upgradeValue(type, currentLevel + 1), level: currentLevel + 1 };
}

export function effectiveProfitPerHour(rawProfitPerHour: number, economy: EconomyConfig = ECONOMY_CONFIG): number {
  const raw = Math.max(0, rawProfitPerHour);
  const softCap = economy.inflation.profitPerHourSoftCap;
  const diminished = raw <= softCap ? raw : softCap + (raw - softCap) * 0.35;
  return Math.floor(Math.min(economy.inflation.maximumEffectiveProfitPerHour, diminished));
}

export function expectedDailyIncome(scenario: keyof typeof ECONOMY_CONFIG.dailyScenarios, profitPerTap: number, profitPerHour: number): number {
  const values = ECONOMY_CONFIG.dailyScenarios[scenario];
  const taps = Math.min(values.creditedTaps, ECONOMY_CONFIG.sources.tap.dailyCreditedTapCap) * Math.max(0, profitPerTap);
  const missions = Math.min(values.missionIncome, ECONOMY_CONFIG.sources.missions.dailyRewardCap);
  const referrals = Math.min(values.referralIncome, ECONOMY_CONFIG.sources.referrals.dailyRewardCap);
  const offline = effectiveProfitPerHour(profitPerHour) * Math.min(values.offlineHours, ECONOMY_CONFIG.sources.offline.capHours);
  return Math.floor(taps + missions + referrals + offline);
}
