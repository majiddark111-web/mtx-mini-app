import type { ServerGameState } from './gameEngine.ts';

export interface AchievementView {
  id: string;
  icon: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unlocked: boolean;
}

type AchievementInput = Pick<ServerGameState, 'xp' | 'level' | 'tapLevel' | 'energyLevel' | 'profitLevel'>;

export function achievementsFor(state: AchievementInput, purchaseCount: number, invited: number): AchievementView[] {
  const upgradeLevels = (state.tapLevel ?? 0) + (state.energyLevel ?? 0) + (state.profitLevel ?? 0);
  const definitions = [
    { id: 'tap-rookie', icon: '👆', title: 'Tap Rookie', description: 'Make 100 verified taps', progress: state.xp, target: 100 },
    { id: 'tap-master', icon: '🔥', title: 'Tap Master', description: 'Make 5,000 verified taps', progress: state.xp, target: 5_000 },
    { id: 'rising-star', icon: '⭐', title: 'Rising Star', description: 'Reach level 5', progress: state.level, target: 5 },
    { id: 'power-builder', icon: '🚀', title: 'Power Builder', description: 'Buy 5 upgrade levels', progress: upgradeLevels, target: 5 },
    { id: 'collector', icon: '🎒', title: 'Collector', description: 'Complete 3 store purchases', progress: purchaseCount, target: 3 },
    { id: 'connector', icon: '🤝', title: 'Connector', description: 'Invite 3 friends', progress: invited, target: 3 },
  ];
  return definitions.map((item) => ({ ...item, progress: Math.min(item.target, Math.max(0, item.progress)), unlocked: item.progress >= item.target }));
}
