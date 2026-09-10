import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTapBatch, createGameState, type ServerGameState } from './gameEngine.ts';
import { MemoryLeaderboardRepository, type LeaderboardRepository } from './social.ts';
import { RedisLeaderboardRepository, type RedisCommands } from './productionStorage.ts';

// Redis command double models sorted-set replacement and GT updates; no live keys.
class RankingRedis implements RedisCommands {
  commands: string[][] = [];
  boards = new Map<string, Map<string, number>>();
  hashes = new Map<string, Map<string, string>>();
  async command<T>(parts: string[]): Promise<T> {
    this.commands.push(parts);
    const [command, key, ...args] = parts;
    if (command === 'ZADD') {
      const gt = args[0] === 'GT'; const [score, userId] = args.slice(gt ? 1 : 0);
      const board = this.boards.get(key) ?? new Map<string, number>();
      if (!gt || !board.has(userId) || Number(score) > board.get(userId)!) board.set(userId, Number(score));
      this.boards.set(key, board); return 1 as T;
    }
    if (command === 'HSET' || command === 'HSETNX') {
      const hash = this.hashes.get(key) ?? new Map<string, string>();
      if (command === 'HSET' || !hash.has(args[0])) hash.set(args[0], args[1]);
      this.hashes.set(key, hash); return 1 as T;
    }
    if (command === 'ZREVRANGE') return [...(this.boards.get(key) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(Number(args[0]), Number(args[1]) + 1).flatMap(([id, score]) => [id, String(score)]) as T;
    if (command === 'HMGET') return args.map((id) => this.hashes.get(key)?.get(id) ?? null) as T;
    if (command === 'HGET') return (this.hashes.get(key)?.get(args[0]) ?? null) as T;
    if (command === 'EXPIREAT') return 1 as T;
    throw new Error(`Unexpected Redis command: ${command}`);
  }
}

const now = Date.UTC(2026, 8, 13, 12);
const earn = (state: ServerGameState, at: number, count: number) => applyTapBatch(state, { taps: count, durationMs: Math.max(1000, count * 100), batchId: 'board-fixture' }, at).state;
const record = (board: LeaderboardRepository, state: ServerGameState, at: number) => board.record(state.userId, 'MTX player', state.coins, at, state.activity);

for (const [name, factory] of [['memory', () => new MemoryLeaderboardRepository()], ['Redis adapter', () => new RedisLeaderboardRepository(new RankingRedis())]] as const) {
  test(`${name}: legacy balances cannot enter period boards`, async () => {
    const board = factory(); const state = { ...createGameState('legacy', now), coins: 1_000_000 };
    await record(board, state, now);
    assert.equal((await board.leaders(10, 'global', now))[0].coins, 1_000_000);
    for (const scope of ['weekly', 'monthly', 'season'] as const) assert.deepEqual(await board.leaders(10, scope, now), []);
  });

  test(`${name}: repeated or stale snapshots do not inflate or reduce earned scores`, async () => {
    const board = factory(); const first = earn(createGameState('active', now), now, 10);
    const second = earn(first, now + 1000, 5);
    await record(board, second, now + 1000); await record(board, second, now + 1000);
    await record(board, { ...first, coins: 0 }, now + 1000);
    assert.equal((await board.leaders(10, 'weekly', now))[0].coins, 15);
  });

  test(`${name}: a new week starts empty despite an existing account balance`, async () => {
    const board = factory(); const first = earn(createGameState('active', now), now, 10);
    await record(board, first, now);
    const nextWeek = now + 86_400_000;
    await record(board, first, nextWeek);
    assert.deepEqual(await board.leaders(10, 'weekly', nextWeek), []);
    const next = earn(first, nextWeek, 3); await record(board, next, nextWeek);
    assert.equal((await board.leaders(10, 'weekly', nextWeek))[0].coins, 3);
    assert.equal((await board.leaders(10, 'monthly', nextWeek))[0].coins, 13);
  });

  test(`${name}: calendar month and quarter reset independently of lifetime coins`, async () => {
    const board = factory(); const at = Date.UTC(2026, 11, 31, 23, 59, 59);
    const first = earn(createGameState('year-end', at), at, 10); await record(board, first, at);
    const next = earn(first, at + 1000, 2); await record(board, next, at + 1000);
    assert.equal((await board.leaders(10, 'monthly', at + 1000))[0].coins, 2);
    assert.equal((await board.leaders(10, 'season', at + 1000))[0].coins, 2);
    assert.equal((await board.leaders(10, 'weekly', at + 1000))[0].coins, 12);
  });
}

test('Redis period boards use fresh keys, expire, and fetch names in one batch', async () => {
  const redis = new RankingRedis();
  redis.boards.set('mtx:leaderboard:weekly:2026-09-07', new Map([['legacy', 999999]]));
  const board = new RedisLeaderboardRepository(redis);
  const state = earn(createGameState('active', now), now, 10); await record(board, state, now);
  assert.deepEqual((await board.leaders(10, 'weekly', now)).map((item) => item.userId), ['active']);
  assert.ok(redis.commands.some((command) => command[0] === 'ZADD' && command[1].startsWith('mtx:leaderboard:v2:weekly:') && command[2] === 'GT'));
  assert.equal(redis.commands.filter((command) => command[0] === 'EXPIREAT').length, 3);
  assert.equal(redis.commands.filter((command) => command[0] === 'HMGET').length, 1);
});
