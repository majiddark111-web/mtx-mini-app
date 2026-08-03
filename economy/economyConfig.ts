export interface EconomyConfig {
  version: number;
  currency: string;
  sources: { tap: { baseProfit: number; dailyCreditedTapCap: number }; offline: { capHours: number }; missions: { dailyRewardCap: number }; referrals: { dailyRewardCap: number } };
  sinks: { upgradeBurnRate: number; marketplaceFeeRate: number };
  inflation: { profitPerHourSoftCap: number; maximumEffectiveProfitPerHour: number };
  upgrades: {
    tap: { baseCost: number; costGrowth: number; baseValue: number; valuePerLevel: number; maximumLevel: number };
    energy: { baseCost: number; costGrowth: number; baseValue: number; valuePerLevel: number; maximumLevel: number };
    profit: { baseCost: number; costGrowth: number; baseValue: number; valueGrowth: number; valueStep: number; maximumLevel: number };
  };
  dailyScenarios: Record<'starter' | 'active' | 'power', { creditedTaps: number; missionIncome: number; referralIncome: number; offlineHours: number }>;
}

export const ECONOMY_CONFIG = {
  version: 1,
  currency: 'MTX',
  sources: {
    tap: { baseProfit: 1, dailyCreditedTapCap: 12_000 },
    offline: { capHours: 3 },
    missions: { dailyRewardCap: 2_000 },
    referrals: { dailyRewardCap: 3_000 },
  },
  sinks: {
    upgradeBurnRate: 1,
    marketplaceFeeRate: 0.05,
  },
  inflation: {
    profitPerHourSoftCap: 100_000,
    maximumEffectiveProfitPerHour: 250_000,
  },
  upgrades: {
    tap: { baseCost: 1_000, costGrowth: 2.2, baseValue: 1, valuePerLevel: 1, maximumLevel: 25 },
    energy: { baseCost: 750, costGrowth: 1.9, baseValue: 1_000, valuePerLevel: 500, maximumLevel: 20 },
    profit: { baseCost: 2_000, costGrowth: 2.35, baseValue: 0, valueGrowth: 1.45, valueStep: 50, maximumLevel: 30 },
  },
  dailyScenarios: {
    starter: { creditedTaps: 2_000, missionIncome: 400, referralIncome: 0, offlineHours: 1 },
    active: { creditedTaps: 6_000, missionIncome: 1_200, referralIncome: 500, offlineHours: 2 },
    power: { creditedTaps: 12_000, missionIncome: 2_000, referralIncome: 1_500, offlineHours: 3 },
  },
} as const satisfies EconomyConfig;

export type EconomyUpgradeType = keyof typeof ECONOMY_CONFIG.upgrades;
