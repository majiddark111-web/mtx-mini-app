import type { PostgresQueries } from './productionStorage.ts';

export interface SocialPersistence {
  daily(userId: string): Promise<{ day: string; streak: number } | null>;
  claimDaily(userId: string, day: string, yesterday: string): Promise<number | null>;
  missionClaimed(userId: string, missionId: string, periodKey: string): Promise<boolean>;
  claimMission(userId: string, missionId: string, periodKey: string, now: number): Promise<boolean>;
  referralCount(userId: string): Promise<number>;
  createReferral(referrerId: string, refereeId: string, deviceHash: string, now: number): Promise<'created' | 'referee-used' | 'device-used'>;
  challengeClaimed(userId: string, type: 'combo' | 'cipher', day: string): Promise<boolean>;
  claimChallenge(userId: string, type: 'combo' | 'cipher', day: string, reward: number, now: number): Promise<boolean>;
}

export class PostgresSocialPersistence implements SocialPersistence {
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }
  async daily(userId: string): Promise<{ day: string; streak: number } | null> { const result = await this.database.query<{ day: string; streak: number }>('SELECT claim_day::text AS day, streak FROM lumos_daily_claims WHERE user_id = $1', [userId]); return result.rows[0] ?? null; }
  async claimDaily(userId: string, day: string, yesterday: string): Promise<number | null> { const result = await this.database.query<{ streak: number }>('INSERT INTO lumos_daily_claims (user_id, claim_day, streak) VALUES ($1, $2, 1) ON CONFLICT (user_id) DO UPDATE SET claim_day = EXCLUDED.claim_day, streak = CASE WHEN lumos_daily_claims.claim_day = $3::date THEN LEAST(7, lumos_daily_claims.streak + 1) ELSE 1 END WHERE lumos_daily_claims.claim_day <> EXCLUDED.claim_day RETURNING streak', [userId, day, yesterday]); return result.rows[0]?.streak ?? null; }
  async missionClaimed(userId: string, missionId: string, periodKey: string): Promise<boolean> { const result = await this.database.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM lumos_mission_claims WHERE user_id = $1 AND mission_id = $2 AND period_key = $3) AS exists', [userId, missionId, periodKey]); return Boolean(result.rows[0]?.exists); }
  async claimMission(userId: string, missionId: string, periodKey: string, now: number): Promise<boolean> { const result = await this.database.query<{ user_id: string }>('INSERT INTO lumos_mission_claims (user_id, mission_id, period_key, claimed_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING user_id', [userId, missionId, periodKey, new Date(now).toISOString()]); return result.rows.length === 1; }
  async referralCount(userId: string): Promise<number> { const result = await this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM lumos_referrals WHERE referrer_id = $1', [userId]); return Number(result.rows[0]?.count ?? 0); }
  async createReferral(referrerId: string, refereeId: string, deviceHash: string, now: number): Promise<'created' | 'referee-used' | 'device-used'> { const referee = await this.database.query<{ referee_id: string }>('SELECT referee_id FROM lumos_referrals WHERE referee_id = $1', [refereeId]); if (referee.rows.length) return 'referee-used'; const device = await this.database.query<{ referee_id: string }>('SELECT referee_id FROM lumos_referrals WHERE device_hash = $1', [deviceHash]); if (device.rows.length) return 'device-used'; const result = await this.database.query<{ referee_id: string }>('INSERT INTO lumos_referrals (referee_id, referrer_id, device_hash, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING referee_id', [refereeId, referrerId, deviceHash, new Date(now).toISOString()]); return result.rows.length ? 'created' : 'referee-used'; }
  async challengeClaimed(userId: string, type: 'combo' | 'cipher', day: string): Promise<boolean> { const result = await this.database.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM lumos_challenge_claims WHERE user_id = $1 AND challenge_type = $2 AND challenge_day = $3) AS exists', [userId, type, day]); return Boolean(result.rows[0]?.exists); }
  async claimChallenge(userId: string, type: 'combo' | 'cipher', day: string, reward: number, now: number): Promise<boolean> { const result = await this.database.query<{ user_id: string }>('INSERT INTO lumos_challenge_claims (user_id, challenge_type, challenge_day, reward, claimed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING user_id', [userId, type, day, reward, new Date(now).toISOString()]); return result.rows.length === 1; }
}
