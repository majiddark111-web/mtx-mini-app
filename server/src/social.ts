import type { ServerGameState } from './gameEngine.ts';
import type { GameStorage } from './gameStorage.ts';
import type { SocialPersistence } from './socialPersistence.ts';

export interface MissionView { id: string; title: string; target: number; progress: number; reward: number; claimed: boolean; period: 'daily' | 'weekly' | 'monthly'; }
export interface LeaderboardEntry { userId: string; username: string; coins: number; rank: number; }
export interface LeaderboardRepository { record(userId: string, username: string, coins: number): Promise<void>; leaders(limit: number): Promise<LeaderboardEntry[]>; }
export class MemoryLeaderboardRepository implements LeaderboardRepository {
  private scores = new Map<string, { username: string; coins: number }>();
  async record(userId: string, username: string, coins: number): Promise<void> { this.scores.set(userId, { username, coins }); }
  async leaders(limit: number): Promise<LeaderboardEntry[]> { return [...this.scores.entries()].sort((a, b) => b[1].coins - a[1].coins).slice(0, limit).map(([userId, value], index) => ({ userId, username: value.username, coins: value.coins, rank: index + 1 })); }
}
interface ReferralRecord { referrerId: string; refereeId: string; deviceHash: string; createdAt: number; }

const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);

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
    return Promise.all(definitions.map(async (mission) => ({ ...mission, progress: Math.min(mission.target, mission.progress), claimed: this.persistence ? await this.persistence.missionClaimed(userId, mission.id, dayKey(now)) : this.missionClaims.has(`${userId}:${mission.id}:${dayKey(now)}`) })));
  }

  async claimMission(userId: string, missionId: string, game: GameStorage, now: number): Promise<{ reward: number; state: ServerGameState }> {
    const state = await game.stateFor(userId, now);
    const mission = (await this.missions(userId, state, now)).find((item) => item.id === missionId);
    if (!mission || mission.claimed || mission.progress < mission.target) throw new Error('MISSION_UNAVAILABLE');
    if (this.persistence) { if (!await this.persistence.claimMission(userId, mission.id, dayKey(now), now)) throw new Error('MISSION_UNAVAILABLE'); } else this.missionClaims.add(`${userId}:${mission.id}:${dayKey(now)}`);
    const updated = { ...state, coins: state.coins + mission.reward, version: state.version + 1 };
    game.saveHot(updated); await this.recordScore(userId, userId, updated.coins);
    return { reward: mission.reward, state: updated };
  }

  async dailyStatus(userId: string, now: number): Promise<{ streak: number; reward: number; claimed: boolean }> {
    const claim = this.persistence ? await this.persistence.daily(userId) : this.dailyClaims.get(userId); const claimed = claim?.day === dayKey(now); const streak = claim?.streak ?? 0;
    return { streak, reward: 100 * Math.min(7, claimed ? streak : streak + 1), claimed };
  }

  async claimDaily(userId: string, game: GameStorage, now: number): Promise<{ reward: number; streak: number; state: ServerGameState }> {
    const status = await this.dailyStatus(userId, now); if (status.claimed) throw new Error('DAILY_ALREADY_CLAIMED');
    const previous = this.dailyClaims.get(userId); const yesterday = dayKey(now - 86_400_000); let streak = previous?.day === yesterday ? Math.min(7, previous.streak + 1) : 1;
    if (this.persistence) { const savedStreak = await this.persistence.claimDaily(userId, dayKey(now), yesterday); if (savedStreak === null) throw new Error('DAILY_ALREADY_CLAIMED'); streak = savedStreak; } else this.dailyClaims.set(userId, { day: dayKey(now), streak }); const reward = streak * 100; const state = await game.stateFor(userId, now); const updated = { ...state, coins: state.coins + reward, version: state.version + 1 }; game.saveHot(updated); await this.recordScore(userId, userId, updated.coins);
    return { reward, streak, state: updated };
  }

  async referralStatus(userId: string): Promise<{ code: string; invited: number; earned: number }> { const invited = this.persistence ? await this.persistence.referralCount(userId) : [...this.referrals.values()].filter((record) => record.referrerId === userId).length; return { code: `MTX-${userId}`, invited, earned: invited * 500 }; }

  async challenges(userId: string, now: number): Promise<{ combo: { slots: number; reward: number; claimed: boolean }; cipher: { hint: string; length: number; reward: number; claimed: boolean } }> { const day = dayKey(now); const combo = this.persistence ? await this.persistence.challengeClaimed(userId, 'combo', day) : this.challengeClaims.has(`${userId}:combo:${day}`); const cipher = this.persistence ? await this.persistence.challengeClaimed(userId, 'cipher', day) : this.challengeClaims.has(`${userId}:cipher:${day}`); return { combo: { slots: 3, reward: 750, claimed: combo }, cipher: { hint: 'The current game name', length: 3, reward: 500, claimed: cipher } }; }

  async claimChallenge(userId: string, type: 'combo' | 'cipher', answer: string[], game: GameStorage, now: number): Promise<{ reward: number }> {
    const key = `${userId}:${type}:${dayKey(now)}`; if (this.challengeClaims.has(key)) throw new Error('CHALLENGE_ALREADY_CLAIMED');
    const valid = type === 'cipher' ? answer.length === 1 && answer[0].trim().toUpperCase() === 'MTX' : answer.join('|') === 'upgrade:tap|skin:aurora|boost:recharge'; if (!valid) throw new Error('CHALLENGE_INCORRECT');
    const reward = type === 'combo' ? 750 : 500; if (this.persistence) { if (!await this.persistence.claimChallenge(userId, type, dayKey(now), reward, now)) throw new Error('CHALLENGE_ALREADY_CLAIMED'); } else this.challengeClaims.add(key); const state = await game.stateFor(userId, now); const updated = { ...state, coins: state.coins + reward, version: state.version + 1 }; game.saveHot(updated); await this.recordScore(userId, userId, updated.coins); return { reward };
  }

  async acceptReferral(refereeId: string, code: string, deviceHash: string, game: GameStorage, now: number): Promise<void> {
    const referrerId = code.startsWith('MTX-') ? code.slice(4) : ''; if (!referrerId || referrerId === refereeId) throw new Error('REFERRAL_SELF');
    if (this.referrals.has(refereeId)) throw new Error('REFERRAL_ALREADY_USED');
    if (this.referralDevices.has(deviceHash)) throw new Error('REFERRAL_DEVICE_REUSED');
    if (this.persistence) { const result = await this.persistence.createReferral(referrerId, refereeId, deviceHash, now); if (result === 'referee-used') throw new Error('REFERRAL_ALREADY_USED'); if (result === 'device-used') throw new Error('REFERRAL_DEVICE_REUSED'); } else { this.referrals.set(refereeId, { referrerId, refereeId, deviceHash, createdAt: now }); this.referralDevices.add(deviceHash); }
    const referee = await game.stateFor(refereeId, now); game.saveHot({ ...referee, coins: referee.coins + 250, version: referee.version + 1 });
    const referrer = await game.stateFor(referrerId, now); game.saveHot({ ...referrer, coins: referrer.coins + 500, version: referrer.version + 1 });
  }

  recordScore(userId: string, username: string, coins: number): Promise<void> { return this.leaderboard.record(userId, username, coins); }
  leaders(limit = 100): Promise<LeaderboardEntry[]> { return this.leaderboard.leaders(limit); }
  leaderboardRepository(): LeaderboardRepository { return this.leaderboard; }
}
