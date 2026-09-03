import { upgradeQuote } from '../../economy/economyService.ts';
import type { GameState, UpgradeType } from '../types/game.ts';
import type { ServerGameState } from './gameApiService.ts';

export interface UpgradeQuote { cost: number; value: number; }

export function getUpgradeQuote(type: UpgradeType, state: GameState): UpgradeQuote | null {
  const level = type === 'energy' ? state.energyLevel : state.tapLevel;
  const quote = upgradeQuote(type, level);
  return quote ? { cost: quote.cost, value: quote.value } : null;
}

export function progress(level: number, maximum: number): number {
  return Math.min(100, Math.max(0, Math.round((level / maximum) * 100)));
}

export function withPendingTaps(state: ServerGameState, pendingTaps: number): ServerGameState {
  const accepted = Math.min(Math.max(0, Math.floor(pendingTaps)), state.energy);
  return { ...state, coins: state.coins + accepted * state.profitPerTap, energy: state.energy - accepted };
}
