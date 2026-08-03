import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';

export const GAME_CONFIG = {
  tapSyncIntervalMs: 2_000,
  tapBatchSize: 50,
  maximumTapsPerSecond: 15,
  maximumEnergy: 1_000,
  energyRechargePerSecond: 1,
  offlineProfitCapHours: ECONOMY_CONFIG.sources.offline.capHours,
  initialProfitPerHour: 0,
  initialProfitPerTap: ECONOMY_CONFIG.sources.tap.baseProfit,
  xpPerAcceptedTap: 1,
  criticalTap: { enabled: false, probability: 0, multiplier: 1 },
  combo: { enabled: false, requiredTaps: 0, windowMs: 0, multiplier: 1 },
  autoTap: { enabled: false, tapsPerSecond: 0 },
  boostStacking: 'disabled-until-economy-phase',
} as const;
