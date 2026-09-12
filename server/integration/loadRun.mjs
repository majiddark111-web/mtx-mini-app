import assert from 'node:assert/strict';
import { runMigrations } from '../migrations.mjs';
import { PostgresGameplayPersistence } from '../src/gameplayPersistence.ts';
import { GAME_CONFIG } from '../src/gameConfig.ts';
import { runLoadScenario } from './loadScenario.mjs';

// Caller supplies only the isolated provider. Cleanup must complete before the
// entry point can print a pass marker, including when checks or migrations fail.
export async function runIsolatedLoad(provider, { scenario = runLoadScenario, onStage = () => undefined } = {}) {
  try {
    await runMigrations(provider.postgres);
    let transactions = 0; let gameplayQueries = 0; let redisCommands = 0;
    const measured = {
      transaction: (operation) => {
        transactions++;
        return provider.postgres.transaction((database) => operation({ query: (sql, values) => {
          gameplayQueries++; return database.query(sql, values);
        } }));
      },
      query: (sql, values) => provider.postgres.query(sql, values),
    };
    const redis = { command: (parts) => { redisCommands++; return provider.redis.command(parts); } };
    const services = [new PostgresGameplayPersistence(measured, redis), new PostgresGameplayPersistence(measured, redis)];
    let next = 0;
    return await scenario({
      applyTaps: (userId, batch, now) => services[next++ % services.length].applyTaps(userId, batch, now),
      verify: async (users, rounds, taps) => {
        const states = await provider.postgres.query('SELECT user_id, state FROM mtx_game_state WHERE user_id = ANY($1::text[])', [users]);
        assert.equal(states.rows.length, users.length, 'LOAD_MISSING_USERS');
        for (const { state } of states.rows) {
          assert.equal(state.coins, rounds * taps * GAME_CONFIG.initialProfitPerTap, 'LOAD_BALANCE_MISMATCH');
          assert.equal(state.xp, rounds * taps * GAME_CONFIG.xpPerAcceptedTap, 'LOAD_XP_MISMATCH');
          assert.equal(state.flaggedBatches, 0);
          assert.equal(state.version, 1 + rounds, 'LOAD_VERSION_MISMATCH');
        }
        for (const table of ['mtx_tap_receipts', 'mtx_tap_events']) {
          const counts = await provider.postgres.query('SELECT user_id, COUNT(*)::int AS count, SUM(accepted_taps)::int AS taps FROM ' + table + ' WHERE user_id = ANY($1::text[]) GROUP BY user_id', [users]);
          assert.equal(counts.rows.length, users.length, 'LOAD_MISSING_RECEIPTS_OR_EVENTS');
          for (const row of counts.rows) {
            assert.equal(Number(row.count), rounds, 'LOAD_RECEIPT_OR_EVENT_COUNT');
            assert.equal(Number(row.taps), rounds * taps, 'LOAD_ACCEPTED_TAPS_MISMATCH');
          }
        }
      },
      onStage: (report) => onStage({ ...report, cumulativeGameplayTransactions: transactions,
        cumulativeGameplayQueries: gameplayQueries, cumulativeRedisCommands: redisCommands }),
    });
  } finally { await provider.close(); }
}
