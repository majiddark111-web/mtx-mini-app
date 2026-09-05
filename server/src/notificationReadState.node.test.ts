import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminStorage } from './admin.ts';
import { markNotificationsRead, notificationReadAt } from './notificationReadState.ts';
import type { PostgresQueries } from './productionStorage.ts';

describe('notification inbox', () => {
  it('expires admin announcements after thirty days', async () => {
    const now = Date.UTC(2026, 8, 1);
    const notification = await new AdminStorage().notify('admin', 'Title', 'Message', now);
    assert.equal(notification.expiresAt, now + 30 * 86_400_000);
  });
  it('persists a monotonic per-user read watermark', async () => {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const database: PostgresQueries = { async query<T>(sql: string, values?: unknown[]) { statements.push({ sql, values }); return { rows: sql.startsWith('SELECT') ? [{ read_at: '2026-09-01T00:00:00.000Z' } as T] : [] }; } };
    assert.equal(await notificationReadAt(database, '42'), Date.UTC(2026, 8, 1));
    await markNotificationsRead(database, '42', Date.UTC(2026, 8, 2));
    assert.match(statements[1].sql, /GREATEST/);
    assert.deepEqual(statements[1].values, ['42', '2026-09-02T00:00:00.000Z']);
  });
});
