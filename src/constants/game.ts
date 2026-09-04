import type { Mission } from '../types/game';
import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';

export const DEFAULT_GAME_STATE = {
  score: 0,
  energy: 1_000,
  maxEnergy: 1_000,
  tapLevel: 0,
  energyLevel: 0,
  tapPower: ECONOMY_CONFIG.sources.tap.baseProfit,
  profitPerHour: 0,
  profitLevel: 0,
  boostHistory: [],
} as const;

export const MISSIONS: Mission[] = [
  { id: 'telegram', icon: '📢', title: 'Telegram', subtitle: 'Join our official channel', reward: 200, url: 'https://t.me/TOKXCOIN' },
  { id: 'youtube', icon: '▶️', title: 'YouTube', subtitle: 'Subscribe to our channel', reward: 200, url: 'https://youtube.com/@tokx.community' },
  { id: 'instagram', icon: '📸', title: 'Instagram', subtitle: 'Follow our page', reward: 200, url: 'https://www.instagram.com/tokx_org' },
  { id: 'x', icon: '🕊️', title: 'X (Twitter)', subtitle: 'Follow our community', reward: 200, url: 'https://x.com/Tokxcommunity' },
];
