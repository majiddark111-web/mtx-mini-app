import type { ServerGameState } from './gameEngine.ts';
import { GameStorage, type GameRepository, type QueuedTapEvent, type TapEventQueue } from './gameStorage.ts';
import type { LeaderboardEntry, LeaderboardRepository } from './social.ts';

export interface RedisCommands { command<T>(parts: string[]): Promise<T>; }
export interface PostgresQueries { query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }>; }

export class RedisTapEventQueue implements TapEventQueue {
  private readonly redis: RedisCommands;
  private readonly key: string;
  constructor(redis: RedisCommands, key = 'mtx:tap-events') { this.redis = redis; this.key = key; }
  async enqueue(event: QueuedTapEvent): Promise<void> { await this.redis.command(['RPUSH', this.key, JSON.stringify(event)]); }
  size(): number { throw new Error('Use sizeAsync for a remote Redis queue'); }
  async sizeAsync(): Promise<number> { return Number(await this.redis.command<number>(['LLEN', this.key])); }
  async drain(limit: number): Promise<QueuedTapEvent[]> {
    const values = await this.redis.command<string[] | null>(['LPOP', this.key, String(Math.max(1, limit))]);
    return (values ?? []).map((value) => JSON.parse(value) as QueuedTapEvent);
  }
}

export class PostgresGameRepository implements GameRepository {
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }
  async get(userId: string): Promise<ServerGameState | null> {
    const result = await this.database.query<ServerGameState>('SELECT state FROM mtx_game_state WHERE user_id = $1', [userId]);
    const row = result.rows[0] as unknown as { state?: ServerGameState } | undefined;
    return row?.state ?? null;
  }
  async save(state: ServerGameState): Promise<void> {
    await this.database.query('INSERT INTO mtx_game_state (user_id, state, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()', [state.userId, JSON.stringify(state)]);
  }
}

export function productionGameStorage(redis: RedisCommands, database: PostgresQueries): GameStorage {
  return new GameStorage(new PostgresGameRepository(database), new RedisTapEventQueue(redis));
}

export class RedisLeaderboardRepository implements LeaderboardRepository {
  constructor(privateRedis: RedisCommands) { this.redis = privateRedis; }
  private readonly redis: RedisCommands;
  async record(userId: string, username: string, coins: number): Promise<void> { await this.redis.command(['ZADD', 'mtx:leaderboard:global', String(coins), userId]); await this.redis.command(['HSET', 'mtx:leaderboard:names', userId, username]); }
  async leaders(limit: number): Promise<LeaderboardEntry[]> {
    const values = await this.redis.command<string[]>(['ZREVRANGE', 'mtx:leaderboard:global', '0', String(Math.max(0, limit - 1)), 'WITHSCORES']); const entries: LeaderboardEntry[] = [];
    for (let index = 0; index < values.length; index += 2) { const userId = values[index]; const username = await this.redis.command<string | null>(['HGET', 'mtx:leaderboard:names', userId]); entries.push({ userId, username: username ?? userId, coins: Number(values[index + 1]), rank: index / 2 + 1 }); }
    return entries;
  }
}
