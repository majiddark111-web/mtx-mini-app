import type { PostgresQueries } from './productionStorage.ts';

export interface RewardHistoryRecord { id: string; title: string; amount: number; createdAt: number; }

const missionRewards: Record<string, number> = { 'daily-taps': 300, 'weekly-coins': 1_000, 'monthly-level': 2_000 };
const timestamp = (value: string | Date): number => new Date(value).getTime();

export async function rewardHistory(database: PostgresQueries, userId: string): Promise<RewardHistoryRecord[]> {
  const [missions, challenges, daily, referrals] = await Promise.all([
    database.query<{ mission_id: string; claimed_at: string | Date }>('SELECT mission_id, claimed_at FROM mtx_mission_claims WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 100', [userId]),
    database.query<{ challenge_type: string; reward: string | number; claimed_at: string | Date }>('SELECT challenge_type, reward, claimed_at FROM mtx_challenge_claims WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 100', [userId]),
    database.query<{ claim_day: string; streak: number }>('SELECT claim_day::text AS claim_day, streak FROM mtx_daily_claims WHERE user_id = $1', [userId]),
    database.query<{ referrer_id: string; referee_id: string; created_at: string | Date }>('SELECT referrer_id, referee_id, created_at FROM mtx_referrals WHERE referrer_id = $1 OR referee_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]),
  ]);
  return [
    ...missions.rows.map((row) => ({ id: `mission:${row.mission_id}:${timestamp(row.claimed_at)}`, title: `Mission · ${row.mission_id}`, amount: missionRewards[row.mission_id] ?? 0, createdAt: timestamp(row.claimed_at) })),
    ...challenges.rows.map((row) => ({ id: `challenge:${row.challenge_type}:${timestamp(row.claimed_at)}`, title: `Daily ${row.challenge_type}`, amount: Number(row.reward), createdAt: timestamp(row.claimed_at) })),
    ...daily.rows.map((row) => ({ id: `daily:${row.claim_day}`, title: `Daily reward · streak ${row.streak}`, amount: row.streak * 100, createdAt: timestamp(`${row.claim_day}T00:00:00Z`) })),
    ...referrals.rows.map((row) => ({ id: `referral:${row.referee_id}`, title: row.referrer_id === userId ? 'Friend invited' : 'Referral joined', amount: row.referrer_id === userId ? 500 : 250, createdAt: timestamp(row.created_at) })),
  ].filter((record) => Number.isFinite(record.createdAt) && record.amount > 0).sort((a, b) => b.createdAt - a.createdAt);
}
