import type { CommercePersistence, InventoryEntry, PaymentRecord, PaymentIntent, PurchaseRecord } from './commerce.ts';
import type { PostgresQueries } from './productionStorage.ts';
import type { ServerGameState } from './gameEngine.ts';

interface InventoryRow { item_id: string; category: InventoryEntry['category']; quantity: number; acquired_at: string | Date; }
interface PurchaseRow { id: string; user_id: string; item_id: string; price: string | number; idempotency_key: string; created_at: string | Date; }
interface PaymentRow { transaction_id: string; user_id: string; provider: PaymentRecord['provider']; asset: PaymentRecord['asset']; amount: string | number; credited_coins: string | number; status: PaymentRecord['status']; created_at: string | Date; }

const time = (value: string | Date): number => new Date(value).getTime();
interface IntentRow { transaction_id: string; user_id: string; idempotency_key: string; source_address: string; recipient: string; amount_nano: string | number; credited_coins: string | number; created_at: string | Date; expires_at: string | Date; }
const intentRecord = (row: IntentRow): PaymentIntent => ({ transactionId: row.transaction_id, userId: row.user_id, idempotencyKey: row.idempotency_key, sourceAddress: row.source_address, recipient: row.recipient, amountNano: Number(row.amount_nano), creditedCoins: Number(row.credited_coins), createdAt: time(row.created_at), expiresAt: time(row.expires_at) });
const purchaseRecord = (row: PurchaseRow): PurchaseRecord => ({ id: row.id, userId: row.user_id, itemId: row.item_id, price: Number(row.price), idempotencyKey: row.idempotency_key, createdAt: time(row.created_at) });
const paymentRecord = (row: PaymentRow): PaymentRecord => ({ transactionId: row.transaction_id, userId: row.user_id, provider: row.provider, asset: row.asset, amount: Number(row.amount), creditedCoins: Number(row.credited_coins), status: row.status, createdAt: time(row.created_at) });

export class PostgresCommercePersistence implements CommercePersistence {
  readonly persistsGameState = true;
  private readonly database: PostgresQueries;
  constructor(database: PostgresQueries) { this.database = database; }

  async savePaymentIntent(intent: PaymentIntent): Promise<PaymentIntent> {
    const result = await this.database.query<IntentRow>('INSERT INTO mtx_payment_intents (transaction_id, user_id, idempotency_key, source_address, recipient, amount_nano, credited_coins, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id, idempotency_key) DO UPDATE SET idempotency_key = mtx_payment_intents.idempotency_key RETURNING *', [intent.transactionId, intent.userId, intent.idempotencyKey, intent.sourceAddress, intent.recipient, intent.amountNano, intent.creditedCoins, new Date(intent.createdAt).toISOString(), new Date(intent.expiresAt).toISOString()]);
    return intentRecord(result.rows[0]);
  }
  async paymentIntent(transactionId: string): Promise<PaymentIntent | undefined> {
    const result = await this.database.query<IntentRow>('SELECT * FROM mtx_payment_intents WHERE transaction_id = $1', [transactionId]);
    return result.rows[0] && intentRecord(result.rows[0]);
  }
  async pendingPaymentIntents(userId: string): Promise<PaymentIntent[]> {
    const result = await this.database.query<IntentRow>('SELECT i.* FROM mtx_payment_intents i WHERE i.user_id = $1 AND NOT EXISTS (SELECT 1 FROM mtx_payments p WHERE p.transaction_id = i.transaction_id) ORDER BY i.created_at DESC LIMIT 101', [userId]);
    return result.rows.map(intentRecord);
  }

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

  async equippedSkin(userId: string): Promise<'skin:aurora' | null> {
    const result = await this.database.query<{ skin_item_id: 'skin:aurora' }>('SELECT skin_item_id FROM mtx_equipped_cosmetics WHERE user_id = $1', [userId]);
    return result.rows[0]?.skin_item_id ?? null;
  }

  async selectSkin(userId: string, skinId: 'skin:aurora' | null, now: number): Promise<void> {
    await this.inTransaction(async (database) => {
      if (!skinId) { await database.query('DELETE FROM mtx_equipped_cosmetics WHERE user_id = $1', [userId]); return; }
      const owned = await database.query<{ item_id: string }>('SELECT item_id FROM mtx_inventory WHERE user_id = $1 AND item_id = $2 AND quantity > 0 FOR UPDATE', [userId, skinId]);
      if (!owned.rows[0]) throw new Error('ITEM_NOT_OWNED');
      await database.query('INSERT INTO mtx_equipped_cosmetics (user_id, skin_item_id, equipped_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET skin_item_id = EXCLUDED.skin_item_id, equipped_at = EXCLUDED.equipped_at', [userId, skinId, new Date(now).toISOString()]);
    });
  }

  async payment(transactionId: string): Promise<PaymentRecord | undefined> {
    const result = await this.database.query<PaymentRow>('SELECT transaction_id, user_id, provider, asset, amount, credited_coins, status, created_at FROM mtx_payments WHERE transaction_id = $1', [transactionId]);
    return result.rows[0] && paymentRecord(result.rows[0]);
  }

  async commitPayment(record: PaymentRecord, previousVersion: number, state: ServerGameState): Promise<{ record: PaymentRecord; duplicate: boolean }> {
    return this.inTransaction(async (database) => {
      // Serialize duplicate confirmations even before the payment row exists.
      await database.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mtx:payment:${record.transactionId}`]);
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
