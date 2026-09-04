import type { StateCreator } from 'zustand';
import { loadGameState } from '../../services/storageService';
import { getUpgradeQuote } from '../../services/gameService';
import type { GameState, UpgradeType } from '../../types/game';

export interface GameSlice extends GameState {
  tap: () => void;
  recharge: (amount?: number) => void;
  buyUpgrade: (type: UpgradeType) => boolean;
  setServerGameState: (state: { coins: number; energy: number; maximumEnergy: number; profitPerTap: number; profitPerHour: number; tapLevel?: number; energyLevel?: number; profitLevel?: number }) => void;
}

const initial = loadGameState();
export const createGameSlice: StateCreator<GameSlice, [], [], GameSlice> = (set) => ({
  ...initial,
  tap: () => set((state) => state.energy <= 0 ? state : { score: state.score + state.tapPower, energy: state.energy - 1 }),
  recharge: (amount = 1) => set((state) => state.energy >= state.maxEnergy ? state : { energy: Math.min(state.maxEnergy, state.energy + Math.max(0, Math.floor(amount))) }),
  setServerGameState: (state) => set((current) => ({ score: state.coins, energy: state.energy, maxEnergy: state.maximumEnergy, tapPower: state.profitPerTap, profitPerHour: state.profitPerHour, tapLevel: state.tapLevel ?? current.tapLevel, energyLevel: state.energyLevel ?? current.energyLevel, profitLevel: state.profitLevel ?? current.profitLevel })),
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
