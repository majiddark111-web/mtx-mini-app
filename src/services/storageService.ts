import { DEFAULT_GAME_STATE } from '../constants/game';
import type { BoostHistoryItem, GameState } from '../types/game';

const STORAGE_KEY = 'lumos.gameState.v2';

const safeNumber = (value: unknown, fallback: number, minimum = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback;

function isHistoryItem(value: unknown): value is BoostHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BoostHistoryItem>;
  return typeof item.id === 'string' && (item.type === 'energy' || item.type === 'tap') && typeof item.text === 'string' && typeof item.timestamp === 'number';
}

export function loadGameState(): GameState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_STATE, boostHistory: [] };
    const saved = value as Partial<GameState>;
    const maxEnergy = safeNumber(saved.maxEnergy, DEFAULT_GAME_STATE.maxEnergy, 1);
    return {
      score: safeNumber(saved.score, 0),
      energy: Math.min(maxEnergy, safeNumber(saved.energy, maxEnergy)),
      maxEnergy,
      tapLevel: Math.floor(safeNumber(saved.tapLevel, 0)),
      energyLevel: Math.floor(safeNumber(saved.energyLevel, 0)),
      tapPower: Math.floor(safeNumber(saved.tapPower, 1, 1)),
      boostHistory: Array.isArray(saved.boostHistory) ? saved.boostHistory.filter(isHistoryItem).slice(0, 20) : [],
    };
  } catch {
    return { ...DEFAULT_GAME_STATE, boostHistory: [] };
  }
}

export function saveGameState(state: GameState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage is best-effort in demo mode. */ }
}
