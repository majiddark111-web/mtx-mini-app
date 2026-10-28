import assert from 'node:assert/strict';
import test from 'node:test';
import { GameStorage } from './gameStorage.ts';
import { SocialStorage } from './social.ts';
import { PostgresSocialPersistence } from './socialPersistence.ts';

const day = 86_400_000;
const start = Date.UTC(2026, 9, 20, 12);

test('new daily reward advertises exactly the amount credited', async () => {
  const social = new SocialStorage(); const game = new GameStorage();
  assert.deepEqual(await social.dailyStatus('new', start), { streak: 0, reward: 100, claimed: false });
  assert.equal((await social.claimDaily('new', game, start)).reward, 100);
  assert.deepEqual(await social.dailyStatus('new', start), { streak: 1, reward: 100, claimed: true });
  await assert.rejects(social.claimDaily('new', game, start), /DAILY_ALREADY_CLAIMED/);
  assert.equal((await game.stateFor('new', start)).coins, 100);
});

test('a missed UTC day resets displayed streak and reward before claiming', async () => {
  const social = new SocialStorage(); const game = new GameStorage();
  await social.claimDaily('gap', game, start);
  await social.claimDaily('gap', game, start + day);
  const advertised = await social.dailyStatus('gap', start + 3 * day);
  assert.deepEqual(advertised, { streak: 0, reward: 100, claimed: false });
  const result = await social.claimDaily('gap', game, start + 3 * day);
  assert.equal(result.reward, advertised.reward);
  assert.equal(result.streak, 1);
  assert.equal(result.state.coins, 400);
});

test('consecutive days keep advertised and credited rewards equal through the cap', async () => {
  const social = new SocialStorage(); const game = new GameStorage();
  for (let index = 0; index < 9; index++) {
    const now = start + index * day;
    const status = await social.dailyStatus('streak', now);
    const result = await social.claimDaily('streak', game, now);
    assert.equal(status.reward, Math.min(index + 1, 7) * 100);
    assert.equal(result.reward, status.reward);
  }
  assert.deepEqual(await social.dailyStatus('streak', start + 10 * day), { streak: 0, reward: 100, claimed: false });
});

test('daily status changes at UTC midnight, not after 24 elapsed hours', async () => {
  const social = new SocialStorage(); const game = new GameStorage();
  const now = Date.UTC(2026, 9, 20, 23, 59, 59);
  await social.claimDaily('midnight', game, now);
  assert.deepEqual(await social.dailyStatus('midnight', now + 999), { streak: 1, reward: 100, claimed: true });
  assert.deepEqual(await social.dailyStatus('midnight', now + 1000), { streak: 1, reward: 200, claimed: false });
});

test('reloaded PostgreSQL claim data uses the same gap rules without writing', async () => {
  const persistence = new PostgresSocialPersistence({ async query<T>(sql: string): Promise<{ rows: T[] }> {
    assert.ok(sql.startsWith('SELECT claim_day::text'));
    return { rows: [{ day: '2026-10-20', streak: 6 }] as T[] };
  } });
  assert.deepEqual(await new SocialStorage(undefined, persistence).dailyStatus('persisted', start), { streak: 6, reward: 600, claimed: true });
  assert.deepEqual(await new SocialStorage(undefined, persistence).dailyStatus('persisted', start + day), { streak: 6, reward: 700, claimed: false });
  assert.deepEqual(await new SocialStorage(undefined, persistence).dailyStatus('persisted', start + 2 * day), { streak: 0, reward: 100, claimed: false });
});
