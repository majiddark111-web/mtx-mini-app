import { upgradeQuote } from '../../economy/economyService.ts';
import type { GameState, UpgradeType } from '../types/game.ts';

export interface UpgradeQuote { cost: number; value: number; }

export function getUpgradeQuote(type: UpgradeType, state: GameState): UpgradeQuote | null {
  const level = type === 'energy' ? state.energyLevel : state.tapLevel;
  const quote = upgradeQuote(type, level);
  return quote ? { cost: quote.cost, value: quote.value } : null;
}

export function getRechargeInterval(state: Pick<GameState, 'energy' | 'maxEnergy' | 'energyLevel'>): number {
  const fraction = state.energy / Math.max(1, state.maxEnergy);
  const baseMs = fraction < 0.5 ? 1_200 : fraction < 0.8 ? 2_000 : 3_200;
  const capScale = Math.min(1.25, Math.max(0.85, 750 / Math.max(750, state.maxEnergy)));
  return Math.floor(baseMs * capScale * Math.pow(0.93, state.energyLevel));
}

export function progress(level: number, maximum: number): number {
  return Math.min(100, Math.max(0, Math.round((level / maximum) * 100)));
}
