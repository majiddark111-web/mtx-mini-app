import type { ServerGameState } from './gameEngine.ts';

export type ActivityPeriod = 'daily' | 'weekly' | 'monthly' | 'season';
export interface PeriodActivity { key: string; taps: number; earnedCoins: number; levelsGained: number; }
export type ActivityTotals = Partial<Record<ActivityPeriod, PeriodActivity>>;

export function activityPeriodKey(period: ActivityPeriod, now: number): string {
  const date = new Date(now);
  if (period === 'season') return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (period === 'monthly') return date.toISOString().slice(0, 7);
  if (period === 'weekly') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1);
  return date.toISOString().slice(0, 10);
}

export function activityFor(state: Pick<ServerGameState, 'activity'>, period: ActivityPeriod, now: number): PeriodActivity {
  const key = activityPeriodKey(period, now);
  const saved = state.activity?.[period];
  return saved?.key === key ? { ...saved } : { key, taps: 0, earnedCoins: 0, levelsGained: 0 };
}

// Only verified gameplay calls this function. Wallet credits and social rewards
// preserve these counters, but do not increase them. Stored with the game state.
export function recordGameplayActivity(state: ServerGameState, now: number, income: number, taps = 0, levelsGained = 0): ServerGameState {
  const activity: ActivityTotals = {};
  for (const period of ['daily', 'weekly', 'monthly', 'season'] as const) {
    const current = activityFor(state, period, now);
    activity[period] = { ...current, taps: current.taps + taps, earnedCoins: current.earnedCoins + income, levelsGained: current.levelsGained + Math.max(0, levelsGained) };
  }
  return { ...state, activity };
}
