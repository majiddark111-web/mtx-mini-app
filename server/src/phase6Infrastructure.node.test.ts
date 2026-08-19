import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { issueJwt } from './jwt.ts';
import { LeaderboardGateway, type GatewaySocket, type LeaderboardPubSub } from './leaderboardGateway.ts';
import { MemoryLeaderboardRepository } from './social.ts';
import worker from './worker.ts';
import { PostgresSocialPersistence } from './socialPersistence.ts';
import type { PostgresQueries } from './productionStorage.ts';
import { PostgresCommercePersistence } from './commercePersistence.ts';
import { PostgresAdminPersistence } from './adminPersistence.ts';
import { createGameState } from './gameEngine.ts';
import { PostgresAnomalyPersistence } from './antiCheatPersistence.ts';

describe('phase 6 production infrastructure', () => {
  it('fails closed when persistent infrastructure bindings are missing', async () => {
    const response = await worker.fetch(new Request('https://api.mtx.test/api/session'), { TELEGRAM_BOT_TOKEN: 'test-token-value', JWT_SECRET: 'x'.repeat(32), APP_ORIGIN: 'https://mtx.test' });
    assert.equal(response.status, 503);
  });
  it('authenticates a websocket before subscribing and pushing rankings', async () => {
    const leaderboard = new MemoryLeaderboardRepository(); await leaderboard.record('1', 'MTX', 900);
    let listener: (() => void) | undefined; const pubsub: LeaderboardPubSub = { async subscribe(_channel, next) { listener = next; return () => { listener = undefined; }; } };
    class Socket implements GatewaySocket { messages: string[] = []; closed = 0; send(data: string) { this.messages.push(data); } close(code = 0) { this.closed = code; } }
    const secret = 'phase-six-secret-that-is-longer-than-32-characters'; const token = await issueJwt({ id: '1', firstName: 'MTX' }, secret); const socket = new Socket(); const gateway = new LeaderboardGateway(leaderboard, pubsub, secret);
    const unsubscribe = await gateway.authenticate(socket, JSON.stringify({ type: 'auth', token })); assert.equal(socket.messages.length, 1); assert.equal(socket.closed, 0); listener?.(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(socket.messages.length, 2); unsubscribe();
    const forged = new Socket(); await assert.rejects(() => gateway.authenticate(forged, JSON.stringify({ type: 'auth', token: `${token}x` })), /Unauthorized/); assert.equal(forged.closed, 4401);
  });

  it('uses conflict-safe SQL for concurrent social claims', async () => {
    class CaptureDatabase implements PostgresQueries { statements: string[] = []; async transaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { return operation(this); } async query<T>(sql: string): Promise<{ rows: T[] }> { this.statements.push(sql); if (sql.startsWith('SELECT state')) return { rows: [] }; return { rows: [{ streak: 1, user_id: '1' }] as T[] }; } }
    const database = new CaptureDatabase(); const persistence = new PostgresSocialPersistence(database); const state = createGameState('1', Date.now()); await persistence.claimDaily('1', '2026-08-08', '2026-08-07', state); await persistence.claimMission('1', 'daily-taps', '2026-08-08', Date.now(), state, 300); await persistence.claimChallenge('1', 'cipher', '2026-08-08', 500, Date.now(), state);
    const claimStatements = database.statements.filter((sql) => sql.includes('mtx_daily_claims') || sql.includes('mtx_mission_claims') || sql.includes('mtx_challenge_claims')); assert.equal(claimStatements.length, 3); assert.ok(claimStatements.every((sql) => sql.includes('ON CONFLICT'))); assert.ok(claimStatements[0].includes('WHERE mtx_daily_claims.claim_day <> EXCLUDED.claim_day')); assert.equal(database.statements.filter((sql) => sql.includes('mtx_game_state')).length, 6);
  });

  it('uses database uniqueness for purchase and payment idempotency', async () => {
    class CaptureDatabase implements PostgresQueries { statements: string[] = []; async transaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { return operation(this); } async query<T>(sql: string): Promise<{ rows: T[] }> { this.statements.push(sql); if (sql.startsWith('SELECT')) return { rows: [] }; return { rows: [{ id: '11111111-1111-4111-8111-111111111111', user_id: '1', item_id: 'skin:aurora', price: 10, idempotency_key: 'purchase-key-0001', transaction_id: 'ton:1', provider: 'ton', asset: 'TON', amount: 1, credited_coins: 100, status: 'confirmed', created_at: new Date().toISOString() }] as T[] }; } }
    const database = new CaptureDatabase(); const persistence = new PostgresCommercePersistence(database); const now = Date.now();
    const state = createGameState('1', now);
    await persistence.commitPurchase({ id: '11111111-1111-4111-8111-111111111111', userId: '1', itemId: 'skin:aurora', price: 10, idempotencyKey: 'purchase-key-0001', createdAt: now }, 0, state);
    await persistence.commitPayment({ transactionId: 'ton:1', userId: '1', provider: 'ton', asset: 'TON', amount: 1, creditedCoins: 100, status: 'confirmed', createdAt: now }, 0, state);
    assert.ok(database.statements.some((sql) => sql.includes('FOR UPDATE'))); assert.ok(database.statements.some((sql) => sql.includes('mtx_purchases'))); assert.ok(database.statements.some((sql) => sql.includes('mtx_payments')));
  });

  it('persists admin mutations and audit logs in PostgreSQL', async () => {
    class CaptureDatabase implements PostgresQueries { statements: string[] = []; transactions = 0; async transaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { this.transactions += 1; return operation(this); } async query<T>(sql: string): Promise<{ rows: T[] }> { this.statements.push(sql); return { rows: [] }; } }
    const database = new CaptureDatabase(); const persistence = new PostgresAdminPersistence(database); const now = Date.now();
    await persistence.setBanned('admin-1', 'user-1', true, now);
    await persistence.notify('admin-1', { id: crypto.randomUUID(), title: 'Notice', message: 'Message', createdAt: now });
    assert.equal(database.transactions, 2); assert.ok(database.statements.some((sql) => sql.includes('mtx_admin_bans'))); assert.equal(database.statements.filter((sql) => sql.includes('mtx_admin_logs')).length, 2); assert.ok(database.statements.some((sql) => sql.includes('mtx_notifications')));
  });

  it('persists anti-cheat anomalies and reads them after process restart', async () => {
    class FakeDatabase implements PostgresQueries { stored: { user_id: string; anomaly_type: string; details: string; created_at: string }[] = []; async query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }> { if (sql.startsWith('INSERT')) { this.stored.unshift({ user_id: String(values[1]), anomaly_type: String(values[2]), details: String(values[3]), created_at: String(values[4]) }); return { rows: [] }; } return { rows: this.stored as T[] }; } }
    const database = new FakeDatabase(); const firstProcess = new PostgresAnomalyPersistence(database); await firstProcess.record({ userId: '42', type: 'forged_signature', at: Date.now(), details: { path: '/api/game/taps' } });
    const afterRestart = new PostgresAnomalyPersistence(database); const records = await afterRestart.recent(100); assert.equal(records.length, 1); assert.equal(records[0].userId, '42'); assert.equal(records[0].type, 'forged_signature'); assert.deepEqual(records[0].details, { path: '/api/game/taps' });
  });
});
