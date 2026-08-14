import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameStorage } from './gameStorage.ts';
import { SocialStorage } from './social.ts';
import { RedisLeaderboardRepository, type RedisCommands } from './productionStorage.ts';

describe('phase 6 social systems', () => {
  it('allows one daily claim and continues a next-day streak', async () => {
    const social = new SocialStorage(); const game = new GameStorage(); const now = Date.UTC(2026, 0, 1);
    assert.equal((await social.claimDaily('1', game, now)).reward, 100);
    await assert.rejects(() => social.claimDaily('1', game, now), /DAILY_ALREADY_CLAIMED/);
    const next = await social.claimDaily('1', game, now + 86_400_000); assert.equal(next.reward, 200); assert.equal(next.streak, 2);
  });

  it('rejects self-referral and device reuse across accounts', async () => {
    const social = new SocialStorage(); const game = new GameStorage(); const fingerprint = 'a'.repeat(64);
    await assert.rejects(() => social.acceptReferral('1', 'MTX-1', fingerprint, game, Date.now()), /REFERRAL_SELF/);
    await social.acceptReferral('2', 'MTX-1', fingerprint, game, Date.now());
    await assert.rejects(() => social.acceptReferral('3', 'MTX-1', fingerprint, game, Date.now()), /REFERRAL_DEVICE_REUSED/);
    assert.equal((await game.stateFor('1', Date.now())).coins, 500); assert.equal((await game.stateFor('2', Date.now())).coins, 250);
  });

  it('claims only completed missions once', async () => {
    const social = new SocialStorage(); const game = new GameStorage(); const state = await game.stateFor('1', Date.now()); game.saveHot({ ...state, xp: 500 });
    assert.equal((await social.claimMission('1', 'daily-taps', game, Date.now())).reward, 300);
    await assert.rejects(() => social.claimMission('1', 'daily-taps', game, Date.now()), /MISSION_UNAVAILABLE/);
  });

  it('sorts a simulated 10,000-user leaderboard without database queries', async () => {
    const social = new SocialStorage();
    for (let index = 0; index < 10_000; index += 1) await social.recordScore(String(index), `player-${index}`, index);
    const leaders = await social.leaders(100); assert.equal(leaders.length, 100); assert.equal(leaders[0].coins, 9_999); assert.equal(leaders[99].coins, 9_900);
  });

  it('uses Redis sorted-set commands for production rankings', async () => {
    class FakeRedis implements RedisCommands { commands: string[][] = []; async command<T>(parts: string[]): Promise<T> { this.commands.push(parts); if (parts[0] === 'ZREVRANGE') return ['2', '900', '1', '500'] as T; if (parts[0] === 'HGET') return `player-${parts[2]}` as T; return 1 as T; } }
    const redis = new FakeRedis(); const repository = new RedisLeaderboardRepository(redis); await repository.record('1', 'player-1', 500); const leaders = await repository.leaders(2);
    assert.equal(leaders[0].coins, 900); assert.equal(leaders[0].rank, 1); assert.deepEqual(redis.commands.map((parts) => parts[0]), ['ZADD', 'HSET', 'ZREVRANGE', 'HGET', 'HGET']);
  });

  it('validates combo and cipher on the server and prevents repeat claims', async () => {
    const social = new SocialStorage(); const game = new GameStorage(); const now = Date.UTC(2026, 0, 1);
    await assert.rejects(() => social.claimChallenge('1', 'cipher', ['WRONG'], game, now), /CHALLENGE_INCORRECT/);
    assert.equal((await social.claimChallenge('1', 'cipher', ['MTX'], game, now)).reward, 500);
    assert.equal((await social.claimChallenge('1', 'combo', ['upgrade:tap', 'skin:aurora', 'boost:recharge'], game, now)).reward, 750);
    await assert.rejects(() => social.claimChallenge('1', 'combo', ['upgrade:tap', 'skin:aurora', 'boost:recharge'], game, now), /CHALLENGE_ALREADY_CLAIMED/);
    assert.equal((await game.stateFor('1', now)).coins, 1_250);
  });
});
