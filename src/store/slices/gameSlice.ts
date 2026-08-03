import type { StateCreator } from 'zustand';
import { loadGameState } from '../../services/storageService';
import { getUpgradeQuote } from '../../services/gameService';
import type { GameState, UpgradeType } from '../../types/game';

export interface GameSlice extends GameState {
  tap: () => void;
  recharge: () => void;
  buyUpgrade: (type: UpgradeType) => boolean;
  setServerGameState: (state: { coins: number; energy: number; maximumEnergy: number; profitPerTap: number }) => void;
}

const initial = loadGameState();
export const createGameSlice: StateCreator<GameSlice, [], [], GameSlice> = (set) => ({
  ...initial,
  tap: () => set((state) => state.energy <= 0 ? state : { score: state.score + state.tapPower, energy: state.energy - 1 }),
  recharge: () => set((state) => state.energy >= state.maxEnergy ? state : { energy: state.energy + 1 }),
  setServerGameState: (state) => set({ score: state.coins, energy: state.energy, maxEnergy: state.maximumEnergy, tapPower: state.profitPerTap }),
  buyUpgrade: (type) => {
    let purchased = false;
    set((state) => {
      const quote = getUpgradeQuote(type, state);
      if (!quote || state.score < quote.cost) return state;
      purchased = true;
      const history = [{ id: crypto.randomUUID(), type, text: type === 'energy' ? `Energy upgraded to ${quote.value} (cost ${quote.cost})` : `Tap power upgraded to ${quote.value} (cost ${quote.cost})`, timestamp: Date.now() }, ...state.boostHistory].slice(0, 20);
      return type === 'energy'
        ? { score: state.score - quote.cost, maxEnergy: quote.value, energy: quote.value, energyLevel: state.energyLevel + 1, boostHistory: history }
        : { score: state.score - quote.cost, tapPower: quote.value, tapLevel: state.tapLevel + 1, boostHistory: history };
    });
    return purchased;
  },
});
