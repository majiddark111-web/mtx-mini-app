import type { ServerGameState } from './gameEngine.ts';
import type { GameStorage } from './gameStorage.ts';
import type { SocialPersistence } from './socialPersistence.ts';

export interface MissionView { id: string; title: string; target: number; progress: number; reward: number; claimed: boolean; period: 'daily' | 'weekly' | 'monthly'; }
export interface LeaderboardEntry { userId: string; username: string; coins: number; rank: number; }
export type LeaderboardScope = 'global' | 'weekly' | 'monthly' | 'season';
export interface LeaderboardRepository { record(userId: string, username: string, coins: number, now?: number): Promise<void>; leaders(limit: number, scope?: LeaderboardScope, now?: number): Promise<LeaderboardEntry[]>; }
export const leaderboardPeriodKey = (scope: LeaderboardScope, now: number): string => {
  const date = new Date(now);
  if (scope === 'global') return 'global';
  if (scope === 'monthly') return date.toISOString().slice(0, 7);
  if (scope === 'season') return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
};
export class MemoryLeaderboardRepository implements LeaderboardRepository {
  private scores = new Map<string, Map<string, { username: string; coins: number }>>();
  async record(userId: string, username: string, coins: number, now = Date.now()): Promise<void> { for (const scope of ['global', 'weekly', 'monthly', 'season'] as const) { const key = `${scope}:${leaderboardPeriodKey(scope, now)}`; const board = this.scores.get(key) ?? new Map(); board.set(userId, { username, coins }); this.scores.set(key, board); } }
  async leaders(limit: number, scope: LeaderboardScope = 'global', now = Date.now()): Promise<LeaderboardEntry[]> { const board = this.scores.get(`${scope}:${leaderboardPeriodKey(scope, now)}`) ?? new Map(); return [...board.entries()].sort((a, b) => b[1].coins - a[1].coins).slice(0, limit).map(([userId, value], index) => ({ userId, username: value.username, coins: value.coins, rank: index + 1 })); }
}
interface ReferralRecord { referrerId: string; refereeId: string; deviceHash: string; createdAt: number; }

const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
const missionPeriodKey = (now: number, period: MissionView['period']): string => {
  const date = new Date(now);
  if (period === 'daily') return dayKey(now);
  if (period === 'monthly') return date.toISOString().slice(0, 7);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
};

export class SocialStorage {
  private dailyClaims = new Map<string, { day: string; streak: number }>();
  private missionClaims = new Set<string>();
  private referrals = new Map<string, ReferralRecord>();
  private referralDevices = new Set<string>();
  private challengeClaims = new Set<string>();
  private readonly leaderboard: LeaderboardRepository;
  private readonly persistence?: SocialPersistence;
  constructor(leaderboard: LeaderboardRepository = new MemoryLeaderboardRepository(), persistence?: SocialPersistence) { this.leaderboard = leaderboard; this.persistence = persistence; }

  async missions(userId: string, state: ServerGameState, now: number): Promise<MissionView[]> {
    const definitions = [
      { id: 'daily-taps', title: 'Make 500 verified taps', target: 500, progress: state.xp, reward: 300, period: 'daily' as const },
      { id: 'weekly-coins', title: 'Earn 10,000 MTX', target: 10_000, progress: state.coins, reward: 1_000, period: 'weekly' as const },
      { id: 'monthly-level', title: 'Reach level 10', target: 10, progress: state.level, reward: 2_000, period: 'monthly' as const },
    ];
    return Promise.all(definitions.map(async (mission) => { const periodKey = missionPeriodKey(now, mission.period); return { ...mission, progress: Math.min(mission.target, mission.progress), claimed: this.persistence ? await this.persistence.missionClaimed(userId, mission.id, periodKey) : this.missionClaims.has(`${userId}:${mission.id}:${periodKey}`) }; }));
  }

  async claimMission(userId: string, missionId: string, game: GameStorage, now: number): Promise<{ reward: number; state: ServerGameState }> {
    const state = await game.stateFor(userId, now);
    const mission = (await this.missions(userId, state, now)).find((item) => item.id === missionId);
    if (!mission || mission.claimed || mission.progress < mission.target) throw new Error('MISSION_UNAVAILABLE');
    let updated: ServerGameState;
    if (this.persistence) { const saved = await this.persistence.claimMission(userId, mission.id, missionPeriodKey(now, mission.period), now, state, mission.reward); if (!saved) throw new Error('MISSION_UNAVAILABLE'); updated = saved; } else { this.missionClaims.add(`${userId}:${mission.id}:${missionPeriodKey(now, mission.period)}`); updated = { ...state, coins: state.coins + mission.reward, version: state.version + 1 }; }
    game.saveHot(updated, !this.persistence); await this.recordScore(userId, userId, updated.coins);
    return { reward: mission.reward, state: updated };
  }

  async dailyStatus(userId: string, now: number): Promise<{ streak: number; reward: number; claimed: boolean }> {
    const claim = this.persistence ? await this.persistence.daily(userId) : this.dailyClaims.get(userId); const claimed = claim?.day === dayKey(now); const streak = claim?.streak ?? 0;
    return { streak, reward: 100 * Math.min(7, claimed ? streak : streak + 1), claimed };
  }

  async claimDaily(userId: string, game: GameStorage, now: number): Promise<{ reward: number; streak: number; state: ServerGameState }> {
    const status = await this.dailyStatus(userId, now); if (status.claimed) throw new Error('DAILY_ALREADY_CLAIMED');
    const previous = this.dailyClaims.get(userId); const yesterday = dayKey(now - 86_400_000); let streak = previous?.day === yesterday ? Math.min(7, previous.streak + 1) : 1; const state = await game.stateFor(userId, now); let updated: ServerGameState;
    if (this.persistence) { const saved = await this.persistence.claimDaily(userId, dayKey(now), yesterday, state); if (saved === null) throw new Error('DAILY_ALREADY_CLAIMED'); streak = saved.streak; updated = saved.state; } else { this.dailyClaims.set(userId, { day: dayKey(now), streak }); const reward = streak * 100; updated = { ...state, coins: state.coins + reward, version: state.version + 1 }; } const reward = streak * 100; game.saveHot(updated, !this.persistence); await this.recordScore(userId, userId, updated.coins);
    return { reward, streak, state: updated };
  }

  async referralStatus(userId: string): Promise<{ code: string; invited: number; earned: number }> { const invited = this.persistence ? await this.persistence.referralCount(userId) : [...this.referrals.values()].filter((record) => record.referrerId === userId).length; return { code: `MTX-${userId}`, invited, earned: invited * 500 }; }

  async challenges(userId: string, now: number): Promise<{ combo: { slots: number; reward: number; claimed: boolean }; cipher: { hint: string; length: number; reward: number; claimed: boolean } }> { const day = dayKey(now); const combo = this.persistence ? await this.persistence.challengeClaimed(userId, 'combo', day) : this.challengeClaims.has(`${userId}:combo:${day}`); const cipher = this.persistence ? await this.persistence.challengeClaimed(userId, 'cipher', day) : this.challengeClaims.has(`${userId}:cipher:${day}`); return { combo: { slots: 3, reward: 750, claimed: combo }, cipher: { hint: 'The current game name', length: 3, reward: 500, claimed: cipher } }; }

  async claimChallenge(userId: string, type: 'combo' | 'cipher', answer: string[], game: GameStorage, now: number): Promise<{ reward: number }> {
    const key = `${userId}:${type}:${dayKey(now)}`; if (this.challengeClaims.has(key)) throw new Error('CHALLENGE_ALREADY_CLAIMED');
    const valid = type === 'cipher' ? answer.length === 1 && answer[0].trim().toUpperCase() === 'MTX' : answer.join('|') === 'upgrade:tap|skin:aurora|boost:recharge'; if (!valid) throw new Error('CHALLENGE_INCORRECT');
    const reward = type === 'combo' ? 750 : 500; const state = await game.stateFor(userId, now); let updated: ServerGameState; if (this.persistence) { const saved = await this.persistence.claimChallenge(userId, type, dayKey(now), reward, now, state); if (!saved) throw new Error('CHALLENGE_ALREADY_CLAIMED'); updated = saved; } else { this.challengeClaims.add(key); updated = { ...state, coins: state.coins + reward, version: state.version + 1 }; } game.saveHot(updated, !this.persistence); await this.recordScore(userId, userId, updated.coins); return { reward };
  }

  async acceptReferral(refereeId: string, code: string, deviceHash: string, game: GameStorage, now: number): Promise<void> {
    const referrerId = code.startsWith('MTX-') ? code.slice(4) : ''; if (!referrerId || referrerId === refereeId) throw new Error('REFERRAL_SELF');
    if (this.referrals.has(refereeId)) throw new Error('REFERRAL_ALREADY_USED');
    if (this.referralDevices.has(deviceHash)) throw new Error('REFERRAL_DEVICE_REUSED');
    const referee = await game.stateFor(refereeId, now); const referrer = await game.stateFor(referrerId, now);
    if (this.persistence) { const outcome = await this.persistence.createReferral(referrerId, refereeId, deviceHash, now, referrer, referee); if (outcome.result === 'referee-used') throw new Error('REFERRAL_ALREADY_USED'); if (outcome.result === 'device-used') throw new Error('REFERRAL_DEVICE_REUSED'); if (!outcome.referee || !outcome.referrer) throw new Error('REFERRAL_PERSISTENCE_FAILED'); game.saveHot(outcome.referee, false); game.saveHot(outcome.referrer, false); } else { this.referrals.set(refereeId, { referrerId, refereeId, deviceHash, createdAt: now }); this.referralDevices.add(deviceHash); game.saveHot({ ...referee, coins: referee.coins + 250, version: referee.version + 1 }); game.saveHot({ ...referrer, coins: referrer.coins + 500, version: referrer.version + 1 }); }
  }

  recordScore(userId: string, username: string, coins: number, now = Date.now()): Promise<void> { return this.leaderboard.record(userId, username, coins, now); }
  async leaders(scope: LeaderboardScope | 'friends' = 'global', userId?: string, limit = 100, now = Date.now()): Promise<LeaderboardEntry[]> { const boardScope = scope === 'friends' ? 'global' : scope; const entries = await this.leaderboard.leaders(scope === 'friends' ? 10_000 : limit, boardScope, now); if (scope !== 'friends' || !userId) return entries; const network = this.persistence ? await this.persistence.referralNetwork(userId) : [...this.referrals.values()].filter((item) => item.referrerId === userId || item.refereeId === userId).flatMap((item) => [item.referrerId, item.refereeId]); const allowed = new Set([userId, ...network]); return entries.filter((entry) => allowed.has(entry.userId)).slice(0, limit).map((entry, index) => ({ ...entry, rank: index + 1 })); }
  leaderboardRepository(): LeaderboardRepository { return this.leaderboard; }
}
