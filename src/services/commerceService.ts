import { httpClient } from '../api/httpClient';

export type CatalogCategory = 'upgrade' | 'boost' | 'skin' | 'consumable';
export interface CatalogItem { id: string; category: CatalogCategory; title: string; description: string; price: number; featured: boolean; limited: boolean; owned: boolean; }
export interface InventoryEntry { itemId: string; category: CatalogCategory; quantity: number; acquiredAt: number; }
export interface PurchaseRecord { id: string; itemId: string; price: number; createdAt: number; }
export interface PaymentRecord { transactionId: string; provider: 'ton' | 'usdt'; asset: 'TON' | 'USDT'; amount: number; creditedCoins: number; status: 'pending' | 'confirmed' | 'failed' | 'refunded'; createdAt: number; }

export async function fetchCatalog(): Promise<{ items: CatalogItem[]; coins: number }> { return (await httpClient.get('/api/store/catalog')).data as { items: CatalogItem[]; coins: number }; }
export async function purchaseItem(itemId: string): Promise<void> { await httpClient.post('/api/store/purchase', { itemId, idempotencyKey: crypto.randomUUID() }); }
export async function fetchInventory(): Promise<{ items: InventoryEntry[]; purchases: PurchaseRecord[] }> { return (await httpClient.get('/api/inventory')).data as { items: InventoryEntry[]; purchases: PurchaseRecord[] }; }
export async function fetchTransactions(): Promise<PaymentRecord[]> { return ((await httpClient.get('/api/wallet/transactions')).data as { transactions: PaymentRecord[] }).transactions; }

