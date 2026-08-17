import type { AnomalyPersistence, AnomalyRecord } from './requestSecurity.ts';
import type { PostgresQueries } from './productionStorage.ts';

interface AnomalyRow { user_id: string; anomaly_type: string; details: AnomalyRecord['details'] | string | null; created_at: string | Date; }

export class PostgresAnomalyPersistence implements AnomalyPersistence {
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }
  async record(anomaly: AnomalyRecord): Promise<void> { await this.database.query('INSERT INTO mtx_anti_cheat_anomalies (id, user_id, anomaly_type, details, created_at) VALUES ($1, $2, $3, $4, $5)', [crypto.randomUUID(), anomaly.userId, anomaly.type, anomaly.details ? JSON.stringify(anomaly.details) : null, new Date(anomaly.at).toISOString()]); }
  async recent(limit: number): Promise<AnomalyRecord[]> { const safeLimit = Math.min(1_000, Math.max(1, Math.floor(limit))); const result = await this.database.query<AnomalyRow>('SELECT user_id, anomaly_type, details, created_at FROM mtx_anti_cheat_anomalies ORDER BY created_at DESC LIMIT $1', [safeLimit]); return result.rows.map((row) => ({ userId: row.user_id, type: row.anomaly_type, at: new Date(row.created_at).getTime(), details: this.details(row.details) })); }
  private details(value: AnomalyRow['details']): AnomalyRecord['details'] | undefined { if (!value) return undefined; return typeof value === 'string' ? JSON.parse(value) as AnomalyRecord['details'] : value; }
}
