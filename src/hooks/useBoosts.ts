import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';
import { getUpgradeQuote, progress } from '../services/gameService';
import { useAppStore } from '../store/useAppStore';
import type { UpgradeType } from '../types/game';

export interface BoostViewModel { type: UpgradeType; label: string; icon: string; current: string; quote: ReturnType<typeof getUpgradeQuote>; progress: number; }
export function useBoosts() {
  const state = useAppStore();
  const buyUpgrade = useAppStore((item) => item.buyUpgrade);
  const boosts: BoostViewModel[] = [
    { type: 'energy', label: 'Extra Energy', icon: '🔋', current: String(state.maxEnergy), quote: getUpgradeQuote('energy', state), progress: progress(state.energyLevel, ECONOMY_CONFIG.upgrades.energy.maximumLevel) },
    { type: 'tap', label: 'Extra Tap', icon: '👆', current: `${state.tapPower} /tap`, quote: getUpgradeQuote('tap', state), progress: progress(state.tapLevel, ECONOMY_CONFIG.upgrades.tap.maximumLevel) },
  ];
  return { boosts, history: state.boostHistory, buyUpgrade };
}
