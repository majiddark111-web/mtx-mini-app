import type { ServerGameState } from './gameEngine.ts';
import { GameStorage, type GameRepository, type QueuedTapEvent, type TapEventQueue } from './gameStorage.ts';

export interface RedisCommands { command<T>(parts: string[]): Promise<T>; }
export interface PostgresQueries { query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }>; }

export class RedisTapEventQueue implements TapEventQueue {
  constructor(private readonly redis: RedisCommands, private readonly key = 'lumos:tap-events') {}
  async enqueue(event: QueuedTapEvent): Promise<void> { await this.redis.command(['RPUSH', this.key, JSON.stringify(event)]); }
  size(): number { throw new Error('Use sizeAsync for a remote Redis queue'); }
  async sizeAsync(): Promise<number> { return Number(await this.redis.command<number>(['LLEN', this.key])); }
  async drain(limit: number): Promise<QueuedTapEvent[]> {
    const values = await this.redis.command<string[] | null>(['LPOP', this.key, String(Math.max(1, limit))]);
    return (values ?? []).map((value) => JSON.parse(value) as QueuedTapEvent);
  }
}

export class PostgresGameRepository implements GameRepository {
  constructor(private readonly database: PostgresQueries) {}
  async get(userId: string): Promise<ServerGameState | null> {
    const result = await this.database.query<ServerGameState>('SELECT state FROM lumos_game_state WHERE user_id = $1', [userId]);
    const row = result.rows[0] as unknown as { state?: ServerGameState } | undefined;
    return row?.state ?? null;
  }
  async save(state: ServerGameState): Promise<void> {
    await this.database.query('INSERT INTO lumos_game_state (user_id, state, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()', [state.userId, JSON.stringify(state)]);
  }
}

export function productionGameStorage(redis: RedisCommands, database: PostgresQueries): GameStorage {
  return new GameStorage(new PostgresGameRepository(database), new RedisTapEventQueue(redis));
}

