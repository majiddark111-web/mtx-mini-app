import { GAME_CONFIG } from './gameConfig.ts';
import { effectiveProfitPerHour } from '../../economy/economyService.ts';
import { ECONOMY_CONFIG, type EconomyConfig } from '../../economy/economyConfig.ts';

export interface ServerGameState {
  userId: string;
  coins: number;
  xp: number;
  level: number;
  rank: string;
  energy: number;
  maximumEnergy: number;
  profitPerTap: number;
  profitPerHour: number;
  tapLevel: number;
  energyLevel: number;
  profitLevel: number;
  lastEnergyAt: number;
  lastSeenAt: number;
  lastTapAt: number;
  flaggedBatches: number;
  version: number;
}

export interface TapBatch { taps: number; durationMs: number; batchId: string; }

export function createGameState(userId: string, now: number): ServerGameState {
  return { userId, coins: 0, xp: 0, level: 1, rank: 'Bronze', energy: GAME_CONFIG.maximumEnergy, maximumEnergy: GAME_CONFIG.maximumEnergy, profitPerTap: GAME_CONFIG.initialProfitPerTap, profitPerHour: GAME_CONFIG.initialProfitPerHour, tapLevel: 0, energyLevel: 0, profitLevel: 0, lastEnergyAt: now, lastSeenAt: now, lastTapAt: 0, flaggedBatches: 0, version: 1 };
}

export function levelForXp(xp: number): number { return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1; }
export function rankForLevel(level: number): string { return level >= 50 ? 'Diamond' : level >= 30 ? 'Platinum' : level >= 20 ? 'Gold' : level >= 10 ? 'Silver' : 'Bronze'; }

export function rechargeEnergy(state: ServerGameState, now: number): ServerGameState {
  const elapsedSeconds = Math.max(0, Math.floor((now - state.lastEnergyAt) / 1_000));
  if (elapsedSeconds === 0) return state;
  return { ...state, energy: Math.min(state.maximumEnergy, state.energy + elapsedSeconds * GAME_CONFIG.energyRechargePerSecond), lastEnergyAt: state.lastEnergyAt + elapsedSeconds * 1_000 };
}

export function calculateOfflineProfit(profitPerHour: number, elapsedMs: number, economy: EconomyConfig = ECONOMY_CONFIG): number {
  const cappedHours = Math.min(economy.sources.offline.capHours, Math.max(0, elapsedMs) / 3_600_000);
  return Math.floor(Math.max(0, profitPerHour) * cappedHours);
}

export function applyOfflineProfit(state: ServerGameState, now: number, economy: EconomyConfig = ECONOMY_CONFIG): { state: ServerGameState; offlineProfit: number } {
  const offlineProfit = calculateOfflineProfit(effectiveProfitPerHour(state.profitPerHour, economy), now - state.lastSeenAt, economy);
  return { state: { ...rechargeEnergy(state, now), coins: state.coins + offlineProfit, lastSeenAt: now, version: state.version + 1 }, offlineProfit };
}

export function applyTapBatch(state: ServerGameState, batch: TapBatch, now: number): { state: ServerGameState; acceptedTaps: number; flagged: boolean } {
  const durationSeconds = batch.durationMs / 1_000;
  const flagged = durationSeconds <= 0 || batch.taps / durationSeconds > GAME_CONFIG.maximumTapsPerSecond;
  if (flagged) return { state: { ...state, flaggedBatches: state.flaggedBatches + 1, lastSeenAt: now, version: state.version + 1 }, acceptedTaps: 0, flagged: true };
  const recharged = rechargeEnergy(state, now);
  const acceptedTaps = Math.min(batch.taps, recharged.energy);
  const xp = recharged.xp + acceptedTaps * GAME_CONFIG.xpPerAcceptedTap;
  const level = levelForXp(xp);
  return {
    state: { ...recharged, coins: recharged.coins + acceptedTaps * recharged.profitPerTap, xp, level, rank: rankForLevel(level), energy: recharged.energy - acceptedTaps, lastTapAt: now, lastSeenAt: now, version: recharged.version + 1 },
    acceptedTaps,
    flagged: false,
  };
}
