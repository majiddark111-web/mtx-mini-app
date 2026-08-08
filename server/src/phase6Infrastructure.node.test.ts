import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { issueJwt } from './jwt.ts';
import { LeaderboardGateway, type GatewaySocket, type LeaderboardPubSub } from './leaderboardGateway.ts';
import { MemoryLeaderboardRepository } from './social.ts';
import { PostgresSocialPersistence } from './socialPersistence.ts';
import type { PostgresQueries } from './productionStorage.ts';

describe('phase 6 production infrastructure', () => {
  it('authenticates a websocket before subscribing and pushing rankings', async () => {
    const leaderboard = new MemoryLeaderboardRepository(); await leaderboard.record('1', 'Lumos', 900);
    let listener: (() => void) | undefined; const pubsub: LeaderboardPubSub = { async subscribe(_channel, next) { listener = next; return () => { listener = undefined; }; } };
    class Socket implements GatewaySocket { messages: string[] = []; closed = 0; send(data: string) { this.messages.push(data); } close(code = 0) { this.closed = code; } }
    const secret = 'phase-six-secret-that-is-longer-than-32-characters'; const token = await issueJwt({ id: '1', firstName: 'Lumos' }, secret); const socket = new Socket(); const gateway = new LeaderboardGateway(leaderboard, pubsub, secret);
    const unsubscribe = await gateway.authenticate(socket, JSON.stringify({ type: 'auth', token })); assert.equal(socket.messages.length, 1); assert.equal(socket.closed, 0); listener?.(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(socket.messages.length, 2); unsubscribe();
    const forged = new Socket(); await assert.rejects(() => gateway.authenticate(forged, JSON.stringify({ type: 'auth', token: `${token}x` })), /Unauthorized/); assert.equal(forged.closed, 4401);
  });

  it('uses conflict-safe SQL for concurrent social claims', async () => {
    class CaptureDatabase implements PostgresQueries { statements: string[] = []; async query<T>(sql: string): Promise<{ rows: T[] }> { this.statements.push(sql); return { rows: [{ streak: 1, user_id: '1' }] as T[] }; } }
    const database = new CaptureDatabase(); const persistence = new PostgresSocialPersistence(database); await persistence.claimDaily('1', '2026-08-08', '2026-08-07'); await persistence.claimMission('1', 'daily-taps', '2026-08-08', Date.now()); await persistence.claimChallenge('1', 'cipher', '2026-08-08', 500, Date.now());
    assert.equal(database.statements.length, 3); assert.ok(database.statements.every((sql) => sql.includes('ON CONFLICT'))); assert.ok(database.statements[0].includes('WHERE lumos_daily_claims.claim_day <> EXCLUDED.claim_day'));
  });
});
