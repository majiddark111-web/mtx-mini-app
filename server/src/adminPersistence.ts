import type { AdminEvent, AdminLog, AdminNotification, AdminPersistence, AdminSnapshot } from './admin.ts';
import type { PostgresQueries } from './productionStorage.ts';

interface LogRow { id: string; admin_id: string; action: string; target?: string; created_at: string | Date; }
interface NotificationRow { id: string; title: string; message: string; created_at: string | Date; }
interface EventRow { id: string; title: string; starts_at: string | Date; ends_at: string | Date; multiplier: string | number; }
const time = (value: string | Date): number => new Date(value).getTime();

export class PostgresAdminPersistence implements AdminPersistence {
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }
  async isBanned(userId: string): Promise<boolean> { const result = await this.database.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM mtx_admin_bans WHERE user_id = $1) AS exists', [userId]); return Boolean(result.rows[0]?.exists); }
  async setBanned(adminId: string, userId: string, banned: boolean, now: number): Promise<void> {
    await this.inTransaction(async (database) => { if (banned) await database.query('INSERT INTO mtx_admin_bans (user_id, admin_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET admin_id = EXCLUDED.admin_id, created_at = EXCLUDED.created_at', [userId, adminId, new Date(now).toISOString()]); else await database.query('DELETE FROM mtx_admin_bans WHERE user_id = $1', [userId]); await this.log(database, adminId, banned ? 'user.ban' : 'user.unban', userId, now); });
  }
  async notify(adminId: string, item: AdminNotification): Promise<void> { await this.inTransaction(async (database) => { await database.query('INSERT INTO mtx_notifications (id, title, message, created_at) VALUES ($1, $2, $3, $4)', [item.id, item.title, item.message, new Date(item.createdAt).toISOString()]); await this.log(database, adminId, 'notification.create', item.id, item.createdAt); }); }
  async createEvent(adminId: string, item: AdminEvent): Promise<void> { await this.inTransaction(async (database) => { await database.query('INSERT INTO mtx_events (id, title, starts_at, ends_at, multiplier) VALUES ($1, $2, $3, $4, $5)', [item.id, item.title, new Date(item.startsAt).toISOString(), new Date(item.endsAt).toISOString(), item.multiplier]); await this.log(database, adminId, 'event.create', item.id, Date.now()); }); }
  async snapshot(): Promise<AdminSnapshot> {
    const [bans, logs, notifications, events] = await Promise.all([
      this.database.query<{ user_id: string }>('SELECT user_id FROM mtx_admin_bans ORDER BY created_at DESC', []),
      this.database.query<LogRow>('SELECT id, admin_id, action, target, created_at FROM mtx_admin_logs ORDER BY created_at DESC LIMIT 1000', []),
      this.database.query<NotificationRow>('SELECT id, title, message, created_at FROM mtx_notifications ORDER BY created_at DESC LIMIT 1000', []),
      this.database.query<EventRow>('SELECT id, title, starts_at, ends_at, multiplier FROM mtx_events ORDER BY starts_at DESC LIMIT 1000', []),
    ]);
    return {
      banned: bans.rows.map((row) => row.user_id),
      logs: logs.rows.map((row): AdminLog => ({ id: row.id, adminId: row.admin_id, action: row.action, target: row.target, createdAt: time(row.created_at) })),
      notifications: notifications.rows.map((row): AdminNotification => ({ id: row.id, title: row.title, message: row.message, createdAt: time(row.created_at) })),
      events: events.rows.map((row): AdminEvent => ({ id: row.id, title: row.title, startsAt: time(row.starts_at), endsAt: time(row.ends_at), multiplier: Number(row.multiplier) })),
    };
  }
  private async log(database: PostgresQueries, adminId: string, action: string, target: string, now: number): Promise<void> { await database.query('INSERT INTO mtx_admin_logs (id, admin_id, action, target, created_at) VALUES ($1, $2, $3, $4, $5)', [crypto.randomUUID(), adminId, action, target, new Date(now).toISOString()]); }
  private async inTransaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { if (!this.database.transaction) throw new Error('POSTGRES_TRANSACTIONS_REQUIRED'); return this.database.transaction(operation); }
}
