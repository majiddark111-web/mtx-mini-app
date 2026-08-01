import { ENERGY_CAPS, TAP_POWERS } from '../constants/game';
import { getUpgradeQuote, progress } from '../services/gameService';
import { useAppStore } from '../store/useAppStore';
import type { UpgradeType } from '../types/game';

export interface BoostViewModel { type: UpgradeType; label: string; icon: string; current: string; quote: ReturnType<typeof getUpgradeQuote>; progress: number; }
export function useBoosts() {
  const state = useAppStore();
  const buyUpgrade = useAppStore((item) => item.buyUpgrade);
  const boosts: BoostViewModel[] = [
    { type: 'energy', label: 'Extra Energy', icon: '🔋', current: String(state.maxEnergy), quote: getUpgradeQuote('energy', state), progress: progress(state.energyLevel, ENERGY_CAPS.length) },
    { type: 'tap', label: 'Extra Tap', icon: '👆', current: `${state.tapPower} /tap`, quote: getUpgradeQuote('tap', state), progress: progress(state.tapLevel, TAP_POWERS.length) },
  ];
  return { boosts, history: state.boostHistory, buyUpgrade };
}
