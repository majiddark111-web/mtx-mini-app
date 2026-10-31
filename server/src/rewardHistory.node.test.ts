import assert from 'node:assert/strict';
import { it } from 'node:test';
import { rewardHistory } from './rewardHistory.ts';
import type { PostgresQueries } from './productionStorage.ts';

it('combines verified reward records in newest-first order', async () => {
  const database: PostgresQueries = { async query<T>(sql: string): Promise<{ rows: T[] }> {
    if (sql.includes('mtx_mission_claims')) return { rows: [{ mission_id: 'daily-taps', claimed_at: '2026-08-01T10:00:00Z' }] as T[] };
    if (sql.includes('mtx_challenge_claims')) return { rows: [{ challenge_type: 'cipher', reward: 500, claimed_at: '2026-08-03T10:00:00Z' }] as T[] };
    if (sql.includes('mtx_daily_reward_history')) return { rows: [{ claim_day: '2026-08-02', streak: 2, reward: 200, claimed_at: null }] as T[] };
    if (sql.includes('mtx_referrals')) return { rows: [{ referrer_id: '42', referee_id: '84', created_at: '2026-08-04T10:00:00Z' }] as T[] };
    return { rows: [] };
  } };
  const records = await rewardHistory(database, '42');
  assert.equal(records.find((row) => row.id === 'daily:2026-08-02')?.dateOnly, '2026-08-02');
  assert.deepEqual(records.map(({ title, amount }) => ({ title, amount })), [
    { title: 'Friend invited', amount: 500 },
    { title: 'Daily cipher', amount: 500 },
    { title: 'Daily reward · streak 2', amount: 200 },
    { title: 'Mission · daily-taps', amount: 300 },
  ]);
});

it('reads multiple archived daily claims with actual credit and exact time when known', async () => {
  const database: PostgresQueries = { async query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }> {
    assert.deepEqual(values, ['42']);
    if (!sql.includes('mtx_daily_reward_history')) return { rows: [] };
    assert.match(sql, /ORDER BY claim_day DESC LIMIT 100/);
    return { rows: [
      { claim_day: '2026-10-30', streak: 2, reward: 200, claimed_at: '2026-10-30T12:34:56Z' },
      { claim_day: '2026-10-29', streak: 1, reward: 100, claimed_at: null },
    ] as T[] };
  } };
  const rows = await rewardHistory(database, '42');
  assert.deepEqual(rows.map((row) => row.amount), [200, 100]);
  assert.equal(rows[0].createdAt, Date.parse('2026-10-30T12:34:56Z'));
  assert.equal(rows[0].dateOnly, undefined);
  assert.equal(rows[1].dateOnly, '2026-10-29');
});
