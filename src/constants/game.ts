import type { Mission } from '../types/game';

export const DEFAULT_GAME_STATE = {
  score: 0,
  energy: 1_000,
  maxEnergy: 1_000,
  tapLevel: 0,
  energyLevel: 0,
  tapPower: 1,
  boostHistory: [],
} as const;

export const ENERGY_COSTS = [750, 2_500, 5_000, 30_000] as const;
export const ENERGY_CAPS = [1_500, 2_500, 4_000, 10_000] as const;
export const TAP_COSTS = [1_000, 5_000, 25_000] as const;
export const TAP_POWERS = [2, 3, 5] as const;

export const MISSIONS: Mission[] = [
  { id: 'telegram', icon: '📢', title: 'Telegram', subtitle: 'Join our official channel', reward: 200, url: 'https://t.me/TOKXCOIN' },
  { id: 'youtube', icon: '▶️', title: 'YouTube', subtitle: 'Subscribe to our channel', reward: 200, url: 'https://youtube.com/@tokx.community' },
  { id: 'instagram', icon: '📸', title: 'Instagram', subtitle: 'Follow our page', reward: 200, url: 'https://www.instagram.com/tokx_org' },
  { id: 'x', icon: '🕊️', title: 'X (Twitter)', subtitle: 'Follow our community', reward: 200, url: 'https://x.com/Tokxcommunity' },
];
