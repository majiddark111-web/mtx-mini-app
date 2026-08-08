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

const levelOf = (state: ServerGameState, type: EconomyUpgradeType): number => type === 'tap' ? state.tapLevel ?? 0 : type === 'energy' ? state.energyLevel ?? 0 : state.profitLevel ?? 0;

export function catalogFor(state: ServerGameState, economy: EconomyConfig, inventory: InventoryEntry[]): CatalogItem[] {
  const upgrades: EconomyUpgradeType[] = ['tap', 'energy', 'profit'];
  const dynamic = upgrades.flatMap((type): CatalogItem[] => {
    const quote = upgradeQuote(type, levelOf(state, type));
    return quote ? [{ id: `upgrade:${type}`, category: 'upgrade', title: `${type[0].toUpperCase()}${type.slice(1)} Level ${quote.level}`, description: `Upgrade ${type} to ${quote.value}`, price: quote.cost, featured: type === 'tap', limited: false, owned: false }] : [];
  });
  const owned = new Set(inventory.map((entry) => entry.itemId));
  return [...dynamic,
    { id: 'skin:aurora', category: 'skin', title: 'Aurora Skin', description: 'Lumos aurora coin appearance', price: economy.upgrades.tap.baseCost * 3, featured: true, limited: true, owned: owned.has('skin:aurora') },
    { id: 'boost:recharge', category: 'boost', title: 'Recharge Boost', description: 'Inventory boost for a future timed activation', price: economy.upgrades.energy.baseCost, featured: false, limited: false, owned: false },
    { id: 'consumable:energy', category: 'consumable', title: 'Energy Cell', description: 'Consumable reserved for Phase 5 activation rules', price: Math.ceil(economy.upgrades.energy.baseCost / 3), featured: false, limited: false, owned: false },
  ];
}

export class CommerceStorage {
  private inventories = new Map<string, InventoryEntry[]>();
  private purchases = new Map<string, PurchaseRecord>();
  private payments = new Map<string, PaymentRecord>();
  inventory(userId: string): InventoryEntry[] { return structuredClone(this.inventories.get(userId) ?? []); }
  purchaseHistory(userId: string): PurchaseRecord[] { return structuredClone([...this.purchases.values()].filter((record) => record.userId === userId)); }
  paymentHistory(userId: string): PaymentRecord[] { return structuredClone([...this.payments.values()].filter((record) => record.userId === userId)); }
  allPayments(): PaymentRecord[] { return structuredClone([...this.payments.values()]); }
  payment(transactionId: string): PaymentRecord | undefined { const record = this.payments.get(transactionId); return record && structuredClone(record); }

  async purchase(userId: string, itemId: string, idempotencyKey: string, gameStorage: GameStorage, economy: EconomyConfig, now: number): Promise<{ state: ServerGameState; record: PurchaseRecord; duplicate: boolean }> {
    const key = `${userId}:${idempotencyKey}`;
    const existing = this.purchases.get(key);
    const state = await gameStorage.stateFor(userId, now);
    if (existing) return { state, record: structuredClone(existing), duplicate: true };
    const item = catalogFor(state, economy, this.inventory(userId)).find((candidate) => candidate.id === itemId);
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
    } else {
      const entries = this.inventories.get(userId) ?? [];
      const entry = entries.find((candidate) => candidate.itemId === itemId);
      if (entry) entry.quantity += 1; else entries.push({ itemId, category: item.category, quantity: 1, acquiredAt: now });
      this.inventories.set(userId, entries);
    }
    const record = { id: crypto.randomUUID(), userId, itemId, price: item.price, createdAt: now, idempotencyKey };
    this.purchases.set(key, record);
    gameStorage.saveHot(updated);
    return { state: updated, record: structuredClone(record), duplicate: false };
  }

  recordPayment(record: PaymentRecord): { record: PaymentRecord; duplicate: boolean } {
    const existing = this.payments.get(record.transactionId);
    if (existing) return { record: structuredClone(existing), duplicate: true };
    this.payments.set(record.transactionId, structuredClone(record));
    return { record: structuredClone(record), duplicate: false };
  }
}
