// Local-only integration harness. Never point this runner at Render or a user database.
import assert from 'node:assert/strict';
import console from 'node:console';
import pg from 'pg';
import { runMigrations } from '../migrations.mjs';
import { createIsolatedScope } from './isolatedInfrastructure.mjs';
import { PostgresCommercePersistence } from '../src/commercePersistence.ts';
import { createGameState } from '../src/gameEngine.ts';

const connectionString = process.env.MTX_PAYMENT_TEST_DATABASE_URL;
if (!connectionString) throw new Error('LOCAL_PAYMENT_TEST_DATABASE_REQUIRED');
const url = new URL(connectionString);
if (url.hostname !== '127.0.0.1' || url.username !== 'mtx_payment_test' || url.pathname !== '/postgres') throw new Error('ISOLATED_LOCAL_DATABASE_ONLY');
let pool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 });
const database = {
  query: (sql, values = []) => pool.query(sql, values),
  transaction: async (operation) => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await operation({ query: (sql, values = []) => client.query(sql, values) }); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
};
let scope;
try {
  assert.equal((await database.query('SELECT current_user AS name')).rows[0].name, 'mtx_payment_test');
  scope = await createIsolatedScope({ postgres: database, redis: { command: () => { throw new Error('REDIS_MUST_NOT_BE_USED'); } } });
  const applied = await runMigrations(scope.postgres);
  assert.ok(applied.includes('005_payment_intents.sql'));
  assert.deepEqual(await runMigrations(scope.postgres), []);
  let persistence = new PostgresCommercePersistence(scope.postgres);
  const now = Date.now();
  const intent = { transactionId: 'ton_1234567890abcdef1234567890abcdef', userId: 'payment-test-user', idempotencyKey: 'test-key-0001', sourceAddress: 'source', recipient: 'treasury-at-order-time', amountNano: 10_000_000, creditedCoins: 100, createdAt: now - 86_400_000, expiresAt: now - 86_400_000 + 900_000 };
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => persistence.savePaymentIntent({ ...intent, transactionId: 'ton_' + String(i).padStart(32, '0') })));
  assert.equal(new Set(results.map((item) => item.transactionId)).size, 1);
  const saved = results[0];
  assert.equal((await persistence.pendingPaymentIntents(intent.userId)).length, 1);
  assert.deepEqual(await persistence.pendingPaymentIntents('another-user'), []);
  const replay = await persistence.savePaymentIntent({ ...intent, creditedCoins: 999, recipient: 'changed-treasury' });
  assert.equal(replay.creditedCoins, 100); assert.equal(replay.recipient, intent.recipient);
  // Drop all connections and recreate application persistence; no Redis exists.
  await pool.end(); pool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 });
  persistence = new PostgresCommercePersistence(scope.postgres);
  assert.deepEqual(await persistence.paymentIntent(saved.transactionId), saved);
  assert.equal((await persistence.pendingPaymentIntents(intent.userId)).length, 1, 'expired intent survives reconnect');

  const initial = createGameState(intent.userId, now);
  await scope.postgres.query('INSERT INTO mtx_game_state (user_id, state) VALUES ($1,$2)', [intent.userId, JSON.stringify(initial)]);
  const record = { transactionId: saved.transactionId, userId: intent.userId, provider: 'ton', asset: 'TON', amount: 0.01, creditedCoins: 100, status: 'confirmed', createdAt: now };
  const credited = { ...initial, coins: initial.coins + 100, version: initial.version + 1 };
  const confirmations = await Promise.all(Array.from({ length: 16 }, () => persistence.commitPayment(record, initial.version, credited)));
  assert.equal(confirmations.filter((item) => !item.duplicate).length, 1);
  assert.equal((await persistence.paymentHistory(intent.userId)).length, 1);
  assert.equal((await scope.postgres.query('SELECT state FROM mtx_game_state WHERE user_id=$1', [intent.userId])).rows[0].state.coins, 100);
  assert.equal((await persistence.pendingPaymentIntents(intent.userId)).length, 0);
  assert.ok(await persistence.paymentIntent(saved.transactionId), 'retained for audit');

  const second = { ...intent, transactionId: 'ton_ffffffffffffffffffffffffffffffff', idempotencyKey: 'test-key-0002' };
  await persistence.savePaymentIntent(second);
  const failing = new PostgresCommercePersistence({
    query: scope.postgres.query,
    transaction: (operation) => scope.postgres.transaction((db) => operation({ query: (sql, values) => {
      if (sql.startsWith('INSERT INTO mtx_payments')) throw new Error('SIMULATED_INSERT_FAILURE');
      return db.query(sql, values);
    } })),
  });
  await assert.rejects(failing.commitPayment({ ...record, transactionId: second.transactionId }, credited.version, { ...credited, coins: 200, version: credited.version + 1 }), /SIMULATED_INSERT_FAILURE/);
  assert.equal((await scope.postgres.query('SELECT state FROM mtx_game_state WHERE user_id=$1', [intent.userId])).rows[0].state.coins, 100);
  assert.equal(await persistence.payment(second.transactionId), undefined);
  assert.equal((await persistence.pendingPaymentIntents(intent.userId))[0].transactionId, second.transactionId);
  console.log('PAYMENT_RECOVERY_POSTGRES_PASS: migration, concurrent create, reconnect, expired recovery, ownership, frozen quote, 16 concurrent confirmations, rollback');
} finally {
  try { if (scope) { await scope.close(); console.log('PAYMENT_RECOVERY_SCHEMA_CLEANED'); } }
  finally { await pool.end(); }
}
