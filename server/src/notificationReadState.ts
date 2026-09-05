import type { PostgresQueries } from './productionStorage.ts';

export async function notificationReadAt(database: PostgresQueries, userId: string): Promise<number> {
  const result = await database.query<{ read_at: string | Date }>('SELECT read_at FROM mtx_notification_read_state WHERE user_id = $1', [userId]);
  return result.rows[0] ? new Date(result.rows[0].read_at).getTime() : 0;
}

export async function markNotificationsRead(database: PostgresQueries, userId: string, now: number): Promise<void> {
  await database.query('INSERT INTO mtx_notification_read_state (user_id, read_at) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET read_at = GREATEST(mtx_notification_read_state.read_at, EXCLUDED.read_at)', [userId, new Date(now).toISOString()]);
}
