import assert from 'node:assert/strict';
import { it } from 'node:test';
import { rewardHistory } from './rewardHistory.ts';
import type { PostgresQueries } from './productionStorage.ts';

it('combines verified reward records in newest-first order', async () => {
  const database: PostgresQueries = { async query<T>(sql: string): Promise<{ rows: T[] }> {
    if (sql.includes('mtx_mission_claims')) return { rows: [{ mission_id: 'daily-taps', claimed_at: '2026-08-01T10:00:00Z' }] as T[] };
    if (sql.includes('mtx_challenge_claims')) return { rows: [{ challenge_type: 'cipher', reward: 500, claimed_at: '2026-08-03T10:00:00Z' }] as T[] };
    if (sql.includes('mtx_daily_claims')) return { rows: [{ claim_day: '2026-08-02', streak: 2 }] as T[] };
    if (sql.includes('mtx_referrals')) return { rows: [{ referrer_id: '42', referee_id: '84', created_at: '2026-08-04T10:00:00Z' }] as T[] };
    return { rows: [] };
  } };
  const records = await rewardHistory(database, '42');
  assert.deepEqual(records.map(({ title, amount }) => ({ title, amount })), [
    { title: 'Friend invited', amount: 500 },
    { title: 'Daily cipher', amount: 500 },
    { title: 'Daily reward · streak 2', amount: 200 },
    { title: 'Mission · daily-taps', amount: 300 },
  ]);
});
