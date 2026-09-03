import { httpClient } from '../api/httpClient';

export type CatalogCategory = 'upgrade' | 'boost' | 'skin' | 'consumable';
export interface CatalogItem { id: string; category: CatalogCategory; title: string; description: string; price: number; featured: boolean; limited: boolean; owned: boolean; }
export interface InventoryEntry { itemId: string; category: CatalogCategory; quantity: number; acquiredAt: number; }
export interface PurchaseRecord { id: string; itemId: string; price: number; createdAt: number; }
export interface PaymentRecord { transactionId: string; provider: 'ton' | 'usdt'; asset: 'TON' | 'USDT'; amount: number; creditedCoins: number; status: 'pending' | 'confirmed' | 'failed' | 'refunded'; createdAt: number; }

export async function fetchCatalog(): Promise<{ items: CatalogItem[]; coins: number }> { return (await httpClient.get('/api/store/catalog')).data as { items: CatalogItem[]; coins: number }; }
export async function purchaseItem(itemId: string): Promise<void> { await httpClient.post('/api/store/purchase', { itemId, idempotencyKey: crypto.randomUUID() }); }
export async function fetchInventory(): Promise<{ items: InventoryEntry[]; purchases: PurchaseRecord[] }> { return (await httpClient.get('/api/inventory')).data as { items: InventoryEntry[]; purchases: PurchaseRecord[] }; }
export type ActivatableInventoryItem = 'boost:recharge' | 'consumable:energy';
export async function activateInventoryItem(itemId: ActivatableInventoryItem): Promise<{ state: { coins: number; energy: number; maximumEnergy: number; profitPerTap: number }; items: InventoryEntry[] }> { return (await httpClient.post('/api/inventory/activate', { itemId })).data as { state: { coins: number; energy: number; maximumEnergy: number; profitPerTap: number }; items: InventoryEntry[] }; }
export async function fetchTransactions(): Promise<PaymentRecord[]> { return ((await httpClient.get('/api/wallet/transactions')).data as { transactions: PaymentRecord[] }).transactions; }
export interface TonPaymentIntent { transactionId: string; recipient: string; amountNano: number; creditedCoins: number; expiresAt: number; }
export async function createTonPaymentIntent(sourceAddress: string): Promise<TonPaymentIntent> { return (await httpClient.post('/api/wallet/payments/intents', { sourceAddress })).data as TonPaymentIntent; }
export async function confirmTonPayment(intent: TonPaymentIntent): Promise<'pending' | 'confirmed'> {
  const response = await httpClient.post('/api/wallet/payments/confirm', { provider: 'ton', transactionId: intent.transactionId, amount: intent.amountNano / 1_000_000_000, asset: 'TON' });
  return response.status === 202 ? 'pending' : 'confirmed';
}
