export type UpgradeType = 'energy' | 'tap';

export interface BoostHistoryItem {
  id: string;
  type: UpgradeType;
  text: string;
  timestamp: number;
}

export interface GameState {
  score: number;
  energy: number;
  maxEnergy: number;
  tapLevel: number;
  energyLevel: number;
  tapPower: number;
  boostHistory: BoostHistoryItem[];
}

export interface Mission {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  reward: number;
  url: string;
}
