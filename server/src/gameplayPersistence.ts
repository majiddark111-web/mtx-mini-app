import { applyOfflineProfit, createGameState, type ServerGameState, type TapBatch } from './gameEngine.ts';
import { applyRateLimitedTapBatch } from './tapRateBudget.ts';
import type { GameplayPersistence, TapSyncResult } from './gameStorage.ts';
import type { PostgresQueries, RedisCommands } from './productionStorage.ts';
import type { EconomyConfig } from '../../economy/economyConfig.ts';

interface Receipt { taps: number; accepted_taps: number; flagged: boolean; }

export class PostgresGameplayPersistence implements GameplayPersistence {
  private readonly database: PostgresQueries;
  private readonly redis?: RedisCommands;
  constructor(database: PostgresQueries, redis?: RedisCommands) {
    if (!database.transaction) throw new Error('POSTGRES_TRANSACTIONS_REQUIRED');
    this.database = database; this.redis = redis;
  }
  private transaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { return this.database.transaction!(operation); }
  private async lockedState(database: PostgresQueries, userId: string, now: number): Promise<ServerGameState> {
    await database.query('INSERT INTO mtx_game_state (user_id, state, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING', [userId, JSON.stringify(createGameState(userId, now))]);
    const result = await database.query<{ state: ServerGameState }>('SELECT state FROM mtx_game_state WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!result.rows[0]) throw new Error('GAME_STATE_UNAVAILABLE');
    return result.rows[0].state;
  }
  private async save(database: PostgresQueries, state: ServerGameState): Promise<void> {
    await database.query('UPDATE mtx_game_state SET state = $2, updated_at = NOW() WHERE user_id = $1', [state.userId, JSON.stringify(state)]);
  }
  applyTaps(userId: string, batch: TapBatch, now: number): Promise<TapSyncResult> {
    return this.transaction(async (database) => {
      const current = await this.lockedState(database, userId, now);
      const saved = await database.query<Receipt>('SELECT taps, accepted_taps, flagged FROM mtx_tap_receipts WHERE user_id = $1 AND batch_id = $2', [userId, batch.batchId]);
      const receipt = saved.rows[0];
      if (receipt) {
        if (receipt.taps !== batch.taps) throw new Error('IDEMPOTENCY_KEY_REUSED');
        return { state: current, acceptedTaps: receipt.accepted_taps, flagged: receipt.flagged, duplicate: true };
      }
      // Preserve deduplication during rollout from the old event/Redis scheme.
      const legacy = await database.query<{ taps: number; accepted_taps: number }>('SELECT taps, accepted_taps FROM mtx_tap_events WHERE user_id = $1 AND batch_id = $2', [userId, batch.batchId]);
      const legacyEvent = legacy.rows[0];
      const legacyClaim = !legacyEvent && this.redis ? await this.redis.command<string | null>(['GET', `mtx:tap-batch:${userId}:${batch.batchId}`]) : null;
      if (legacyEvent && legacyEvent.taps !== batch.taps) throw new Error('IDEMPOTENCY_KEY_REUSED');
      const duplicate = Boolean(legacyEvent || legacyClaim);
      const result = duplicate ? { state: current, acceptedTaps: legacyEvent?.accepted_taps ?? 0, flagged: false } : applyRateLimitedTapBatch(current, batch, Math.max(now, current.lastSeenAt));
      await database.query('INSERT INTO mtx_tap_receipts (user_id, batch_id, taps, accepted_taps, flagged, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [userId, batch.batchId, batch.taps, result.acceptedTaps, result.flagged, new Date(now).toISOString()]);
      if (!duplicate) {
        await this.save(database, result.state);
        await database.query('INSERT INTO mtx_tap_events (user_id, batch_id, taps, accepted_taps, duration_ms, received_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, batch_id) DO NOTHING', [userId, batch.batchId, batch.taps, result.acceptedTaps, batch.durationMs, new Date(now).toISOString()]);
      }
      return { ...result, duplicate };
    });
  }
  creditOffline(userId: string, now: number, economy: EconomyConfig): Promise<{ state: ServerGameState; offlineProfit: number }> {
    return this.transaction(async (database) => {
      const current = await this.lockedState(database, userId, now);
      const result = applyOfflineProfit(current, Math.max(now, current.lastSeenAt), economy);
      await this.save(database, result.state);
      return result;
    });
  }
}
