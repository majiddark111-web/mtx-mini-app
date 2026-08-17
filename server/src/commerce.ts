import type { EconomyConfig, EconomyUpgradeType } from '../../economy/economyConfig.ts';
import { upgradeQuote } from '../../economy/economyService.ts';
import type { ServerGameState } from './gameEngine.ts';
import type { GameStorage } from './gameStorage.ts';

export type CatalogCategory = 'upgrade' | 'boost' | 'skin' | 'consumable';
export interface CatalogItem { id: string; category: CatalogCategory; title: string; description: string; price: number; featured: boolean; limited: boolean; owned: boolean; }
export interface InventoryEntry { itemId: string; category: CatalogCategory; quantity: number; acquiredAt: number; }
export interface PurchaseRecord { id: string; userId: string; itemId: string; price: number; createdAt: number; idempotencyKey: string; }
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export interface PaymentRecord { transactionId: string; userId: string; provider: 'ton' | 'usdt'; asset: 'TON' | 'USDT'; amount: number; creditedCoins: number; status: PaymentStatus; createdAt: number; }

export interface CommercePersistence {
  inventory(userId: string): Promise<InventoryEntry[]>;
  purchaseHistory(userId: string): Promise<PurchaseRecord[]>;
  paymentHistory(userId: string): Promise<PaymentRecord[]>;
  allPayments(): Promise<PaymentRecord[]>;
  purchase(userId: string, idempotencyKey: string): Promise<PurchaseRecord | undefined>;
  commitPurchase(record: PurchaseRecord, previousVersion: number, state: ServerGameState, inventory?: InventoryEntry): Promise<{ record: PurchaseRecord; duplicate: boolean }>;
  payment(transactionId: string): Promise<PaymentRecord | undefined>;
  commitPayment(record: PaymentRecord, previousVersion: number, state: ServerGameState): Promise<{ record: PaymentRecord; duplicate: boolean }>;
}

export class MemoryCommercePersistence implements CommercePersistence {
  private inventories = new Map<string, InventoryEntry[]>();
  private purchases = new Map<string, PurchaseRecord>();
  private payments = new Map<string, PaymentRecord>();
  async inventory(userId: string): Promise<InventoryEntry[]> { return structuredClone(this.inventories.get(userId) ?? []); }
  async purchaseHistory(userId: string): Promise<PurchaseRecord[]> { return structuredClone([...this.purchases.values()].filter((record) => record.userId === userId)); }
  async paymentHistory(userId: string): Promise<PaymentRecord[]> { return structuredClone([...this.payments.values()].filter((record) => record.userId === userId)); }
  async allPayments(): Promise<PaymentRecord[]> { return structuredClone([...this.payments.values()]); }
  async purchase(userId: string, idempotencyKey: string): Promise<PurchaseRecord | undefined> { const record = this.purchases.get(`${userId}:${idempotencyKey}`); return record && structuredClone(record); }
  async commitPurchase(record: PurchaseRecord, previousVersion: number, state: ServerGameState, entry?: InventoryEntry): Promise<{ record: PurchaseRecord; duplicate: boolean }> { void previousVersion; void state; const key = `${record.userId}:${record.idempotencyKey}`; const existing = this.purchases.get(key); if (existing) return { record: structuredClone(existing), duplicate: true }; this.purchases.set(key, structuredClone(record)); if (entry) { const entries = this.inventories.get(record.userId) ?? []; const owned = entries.find((candidate) => candidate.itemId === entry.itemId); if (owned) owned.quantity += entry.quantity; else entries.push(structuredClone(entry)); this.inventories.set(record.userId, entries); } return { record: structuredClone(record), duplicate: false }; }
  async payment(transactionId: string): Promise<PaymentRecord | undefined> { const record = this.payments.get(transactionId); return record && structuredClone(record); }
  async commitPayment(record: PaymentRecord, previousVersion: number, state: ServerGameState): Promise<{ record: PaymentRecord; duplicate: boolean }> { void previousVersion; void state; const existing = this.payments.get(record.transactionId); if (existing) return { record: structuredClone(existing), duplicate: true }; this.payments.set(record.transactionId, structuredClone(record)); return { record: structuredClone(record), duplicate: false }; }
}

const levelOf = (state: ServerGameState, type: EconomyUpgradeType): number => type === 'tap' ? state.tapLevel ?? 0 : type === 'energy' ? state.energyLevel ?? 0 : state.profitLevel ?? 0;

export function catalogFor(state: ServerGameState, economy: EconomyConfig, inventory: InventoryEntry[]): CatalogItem[] {
  const upgrades: EconomyUpgradeType[] = ['tap', 'energy', 'profit'];
  const dynamic = upgrades.flatMap((type): CatalogItem[] => {
    const quote = upgradeQuote(type, levelOf(state, type));
    return quote ? [{ id: `upgrade:${type}`, category: 'upgrade', title: `${type[0].toUpperCase()}${type.slice(1)} Level ${quote.level}`, description: `Upgrade ${type} to ${quote.value}`, price: quote.cost, featured: type === 'tap', limited: false, owned: false }] : [];
  });
  const owned = new Set(inventory.map((entry) => entry.itemId));
  return [...dynamic,
    { id: 'skin:aurora', category: 'skin', title: 'Aurora Skin', description: 'MTX aurora coin appearance', price: economy.upgrades.tap.baseCost * 3, featured: true, limited: true, owned: owned.has('skin:aurora') },
    { id: 'boost:recharge', category: 'boost', title: 'Recharge Boost', description: 'Inventory boost for a future timed activation', price: economy.upgrades.energy.baseCost, featured: false, limited: false, owned: false },
    { id: 'consumable:energy', category: 'consumable', title: 'Energy Cell', description: 'Consumable reserved for Phase 5 activation rules', price: Math.ceil(economy.upgrades.energy.baseCost / 3), featured: false, limited: false, owned: false },
  ];
}

export class CommerceStorage {
  private readonly persistence: CommercePersistence;
  constructor(persistence: CommercePersistence = new MemoryCommercePersistence()) { this.persistence = persistence; }
  inventory(userId: string): Promise<InventoryEntry[]> { return this.persistence.inventory(userId); }
  purchaseHistory(userId: string): Promise<PurchaseRecord[]> { return this.persistence.purchaseHistory(userId); }
  paymentHistory(userId: string): Promise<PaymentRecord[]> { return this.persistence.paymentHistory(userId); }
  allPayments(): Promise<PaymentRecord[]> { return this.persistence.allPayments(); }
  payment(transactionId: string): Promise<PaymentRecord | undefined> { return this.persistence.payment(transactionId); }

  async purchase(userId: string, itemId: string, idempotencyKey: string, gameStorage: GameStorage, economy: EconomyConfig, now: number): Promise<{ state: ServerGameState; record: PurchaseRecord; duplicate: boolean }> {
    const existing = await this.persistence.purchase(userId, idempotencyKey);
    const state = await gameStorage.stateFor(userId, now);
    if (existing) { if (existing.itemId !== itemId) throw new Error('IDEMPOTENCY_KEY_REUSED'); return { state, record: structuredClone(existing), duplicate: true }; }
    const item = catalogFor(state, economy, await this.inventory(userId)).find((candidate) => candidate.id === itemId);
    if (!item || item.owned) throw new Error('ITEM_UNAVAILABLE');
    if (state.coins < item.price) throw new Error('INSUFFICIENT_COINS');
    let updated = { ...state, coins: state.coins - item.price, version: state.version + 1 };
    if (itemId.startsWith('upgrade:')) {
      const type = itemId.slice(8) as EconomyUpgradeType;
      const quote = upgradeQuote(type, levelOf(state, type));
      if (!quote || quote.cost !== item.price) throw new Error('PRICE_CHANGED');
      if (type === 'tap') updated = { ...updated, tapLevel: quote.level, profitPerTap: quote.value };
      if (type === 'energy') updated = { ...updated, energyLevel: quote.level, maximumEnergy: quote.value, energy: quote.value };
      if (type === 'profit') updated = { ...updated, profitLevel: quote.level, profitPerHour: quote.value };
    }
    const record = { id: crypto.randomUUID(), userId, itemId, price: item.price, createdAt: now, idempotencyKey };
    const inventory = itemId.startsWith('upgrade:') ? undefined : { itemId, category: item.category, quantity: 1, acquiredAt: now };
    const created = await this.persistence.commitPurchase(record, state.version, updated, inventory);
    if (created.duplicate) { if (created.record.itemId !== itemId) throw new Error('IDEMPOTENCY_KEY_REUSED'); return { state, record: created.record, duplicate: true }; }
    gameStorage.saveHot(updated);
    return { state: updated, record: structuredClone(record), duplicate: false };
  }

  async recordPayment(record: PaymentRecord, gameStorage: GameStorage, now: number): Promise<{ record: PaymentRecord; duplicate: boolean }> {
    const current = await gameStorage.stateFor(record.userId, now);
    const updated = record.status === 'confirmed' && record.creditedCoins > 0 ? { ...current, coins: current.coins + record.creditedCoins, version: current.version + 1 } : current;
    const outcome = await this.persistence.commitPayment(record, current.version, updated);
    if (!outcome.duplicate && updated !== current) gameStorage.saveHot(updated);
    return outcome;
  }
}
