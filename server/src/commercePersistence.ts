import type { CommercePersistence, InventoryEntry, PaymentRecord, PurchaseRecord } from './commerce.ts';
import type { PostgresQueries } from './productionStorage.ts';
import type { ServerGameState } from './gameEngine.ts';

interface InventoryRow { item_id: string; category: InventoryEntry['category']; quantity: number; acquired_at: string | Date; }
interface PurchaseRow { id: string; user_id: string; item_id: string; price: string | number; idempotency_key: string; created_at: string | Date; }
interface PaymentRow { transaction_id: string; user_id: string; provider: PaymentRecord['provider']; asset: PaymentRecord['asset']; amount: string | number; credited_coins: string | number; status: PaymentRecord['status']; created_at: string | Date; }

const time = (value: string | Date): number => new Date(value).getTime();
const purchaseRecord = (row: PurchaseRow): PurchaseRecord => ({ id: row.id, userId: row.user_id, itemId: row.item_id, price: Number(row.price), idempotencyKey: row.idempotency_key, createdAt: time(row.created_at) });
const paymentRecord = (row: PaymentRow): PaymentRecord => ({ transactionId: row.transaction_id, userId: row.user_id, provider: row.provider, asset: row.asset, amount: Number(row.amount), creditedCoins: Number(row.credited_coins), status: row.status, createdAt: time(row.created_at) });

export class PostgresCommercePersistence implements CommercePersistence {
  readonly persistsGameState = true;
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }

  async inventory(userId: string): Promise<InventoryEntry[]> {
    const result = await this.database.query<InventoryRow>('SELECT item_id, category, quantity, acquired_at FROM mtx_inventory WHERE user_id = $1 ORDER BY acquired_at DESC', [userId]);
    return result.rows.map((row) => ({ itemId: row.item_id, category: row.category, quantity: Number(row.quantity), acquiredAt: time(row.acquired_at) }));
  }

  async purchaseHistory(userId: string): Promise<PurchaseRecord[]> {
    const result = await this.database.query<PurchaseRow>('SELECT id, user_id, item_id, price, idempotency_key, created_at FROM mtx_purchases WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows.map(purchaseRecord);
  }

  async paymentHistory(userId: string): Promise<PaymentRecord[]> {
    const result = await this.database.query<PaymentRow>('SELECT transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at FROM mtx_payments WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows.map(paymentRecord);
  }

  async allPayments(): Promise<PaymentRecord[]> {
    const result = await this.database.query<PaymentRow>('SELECT transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at FROM mtx_payments ORDER BY created_at DESC', []);
    return result.rows.map(paymentRecord);
  }

  async purchase(userId: string, idempotencyKey: string): Promise<PurchaseRecord | undefined> {
    const result = await this.database.query<PurchaseRow>('SELECT id, user_id, item_id, price, idempotency_key, created_at FROM mtx_purchases WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
    return result.rows[0] && purchaseRecord(result.rows[0]);
  }

  async commitPurchase(record: PurchaseRecord, previousVersion: number, state: ServerGameState, inventory?: InventoryEntry): Promise<{ record: PurchaseRecord; duplicate: boolean }> {
    return this.inTransaction(async (database) => {
      const existing = await this.purchaseWith(database, record.userId, record.idempotencyKey);
      if (existing) return { record: existing, duplicate: true };
      await this.lockAndSaveState(database, state, previousVersion);
      const inserted = await database.query<PurchaseRow>('INSERT INTO mtx_purchases (id, user_id, item_id, price, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_id, item_id, price, idempotency_key, created_at', [record.id, record.userId, record.itemId, record.price, record.idempotencyKey, new Date(record.createdAt).toISOString()]);
      if (inventory) await database.query('INSERT INTO mtx_inventory (user_id, item_id, category, quantity, acquired_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = mtx_inventory.quantity + EXCLUDED.quantity', [record.userId, inventory.itemId, inventory.category, inventory.quantity, new Date(inventory.acquiredAt).toISOString()]);
      return { record: purchaseRecord(inserted.rows[0]), duplicate: false };
    });
  }

  async consumeInventory(userId: string, itemId: string, previousVersion: number, state: ServerGameState): Promise<void> {
    await this.inTransaction(async (database) => {
      await this.lockAndSaveState(database, state, previousVersion);
      const owned = await database.query<{ quantity: number }>('SELECT quantity FROM mtx_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
      if (Number(owned.rows[0]?.quantity ?? 0) < 1) throw new Error('ITEM_NOT_OWNED');
      await database.query('UPDATE mtx_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
      await database.query('DELETE FROM mtx_inventory WHERE user_id = $1 AND item_id = $2 AND quantity = 0', [userId, itemId]);
    });
  }

  async payment(transactionId: string): Promise<PaymentRecord | undefined> {
    const result = await this.database.query<PaymentRow>('SELECT transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at FROM mtx_payments WHERE transaction_id = $1', [transactionId]);
    return result.rows[0] && paymentRecord(result.rows[0]);
  }

  async commitPayment(record: PaymentRecord, previousVersion: number, state: ServerGameState): Promise<{ record: PaymentRecord; duplicate: boolean }> {
    return this.inTransaction(async (database) => {
      const existing = await this.paymentWith(database, record.transactionId);
      if (existing) return { record: existing, duplicate: true };
      await this.lockAndSaveState(database, state, previousVersion);
      const inserted = await database.query<PaymentRow>('INSERT INTO mtx_payments (transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at', [record.transactionId, record.userId, record.provider, record.asset, record.amount, record.creditedCoins, record.status, new Date(record.createdAt).toISOString()]);
      return { record: paymentRecord(inserted.rows[0]), duplicate: false };
    });
  }

  private async purchaseWith(database: PostgresQueries, userId: string, idempotencyKey: string): Promise<PurchaseRecord | undefined> { const result = await database.query<PurchaseRow>('SELECT id, user_id, item_id, price, idempotency_key, created_at FROM mtx_purchases WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE', [userId, idempotencyKey]); return result.rows[0] && purchaseRecord(result.rows[0]); }
  private async paymentWith(database: PostgresQueries, transactionId: string): Promise<PaymentRecord | undefined> { const result = await database.query<PaymentRow>('SELECT transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at FROM mtx_payments WHERE transaction_id = $1 FOR UPDATE', [transactionId]); return result.rows[0] && paymentRecord(result.rows[0]); }
  private async lockAndSaveState(database: PostgresQueries, state: ServerGameState, previousVersion: number): Promise<void> {
    const current = await database.query<{ state: ServerGameState }>('SELECT state FROM mtx_game_state WHERE user_id = $1 FOR UPDATE', [state.userId]);
    const storedVersion = current.rows[0]?.state.version;
    if (storedVersion !== undefined && storedVersion !== previousVersion) throw new Error('STATE_VERSION_CONFLICT');
    await database.query('INSERT INTO mtx_game_state (user_id, state, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()', [state.userId, JSON.stringify(state)]);
  }
  private async inTransaction<T>(operation: (database: PostgresQueries) => Promise<T>): Promise<T> { if (!this.database.transaction) throw new Error('POSTGRES_TRANSACTIONS_REQUIRED'); return this.database.transaction(operation); }
}
