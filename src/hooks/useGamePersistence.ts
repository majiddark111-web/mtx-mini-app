import { useEffect } from 'react';
import { saveGameState } from '../services/storageService';
import { useAppStore } from '../store/useAppStore';

export function useGamePersistence(): void {
  useEffect(() => useAppStore.subscribe((state) => saveGameState({ score: state.score, energy: state.energy, maxEnergy: state.maxEnergy, tapLevel: state.tapLevel, energyLevel: state.energyLevel, tapPower: state.tapPower, profitPerHour: state.profitPerHour, profitLevel: state.profitLevel, boostHistory: state.boostHistory })), []);
}
