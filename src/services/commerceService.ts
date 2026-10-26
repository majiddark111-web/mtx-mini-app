import { httpClient } from '../api/httpClient';
import type { ServerGameState } from './gameApiService';
import { paymentResult, validPaymentIntent, type TonPaymentIntent } from './pendingPaymentService';
export type { TonPaymentIntent } from './pendingPaymentService';

export type CatalogCategory = 'upgrade' | 'boost' | 'skin' | 'consumable';
export interface CatalogItem { id: string; category: CatalogCategory; title: string; description: string; price: number; featured: boolean; limited: boolean; owned: boolean; }
export interface InventoryEntry { itemId: string; category: CatalogCategory; quantity: number; acquiredAt: number; }
export interface PurchaseRecord { id: string; itemId: string; price: number; createdAt: number; }
export interface PaymentRecord { transactionId: string; provider: 'ton' | 'usdt'; asset: 'TON' | 'USDT'; amount: number; creditedCoins: number; status: 'pending' | 'confirmed' | 'failed' | 'refunded'; createdAt: number; }
export type EquippedSkin = 'skin:aurora' | null;
export interface InventoryResult { items: InventoryEntry[]; purchases: PurchaseRecord[]; equippedSkin: EquippedSkin; }

export async function fetchCatalog(): Promise<{ items: CatalogItem[]; coins: number }> { return (await httpClient.get('/api/store/catalog')).data as { items: CatalogItem[]; coins: number }; }
export async function purchaseItem(itemId: string): Promise<{ state: ServerGameState; duplicate: boolean }> { return (await httpClient.post('/api/store/purchase', { itemId, idempotencyKey: crypto.randomUUID() })).data as { state: ServerGameState; duplicate: boolean }; }
export async function fetchInventory(): Promise<InventoryResult> { return (await httpClient.get('/api/inventory')).data as InventoryResult; }
export type ActivatableInventoryItem = 'boost:recharge' | 'consumable:energy';
export async function activateInventoryItem(itemId: ActivatableInventoryItem): Promise<{ state: ServerGameState; items: InventoryEntry[] }> { return (await httpClient.post('/api/inventory/activate', { itemId })).data as { state: ServerGameState; items: InventoryEntry[] }; }
export async function selectInventorySkin(skinId: EquippedSkin): Promise<EquippedSkin> { return ((await httpClient.post('/api/inventory/skin', { skinId })).data as { equippedSkin: EquippedSkin }).equippedSkin; }
export async function fetchTransactions(): Promise<PaymentRecord[]> { return ((await httpClient.get('/api/wallet/transactions')).data as { transactions: PaymentRecord[] }).transactions; }
export async function createTonPaymentIntent(sourceAddress: string, idempotencyKey: string): Promise<TonPaymentIntent> {
  const value: unknown = (await httpClient.post('/api/wallet/payments/intents', { sourceAddress, idempotencyKey })).data;
  if (!validPaymentIntent(value)) throw new Error('Invalid payment order');
  return value;
}
export async function fetchPendingPayments(): Promise<{ intents: TonPaymentIntent[]; hasMore: boolean }> {
  const value = (await httpClient.get('/api/wallet/payments/intents')).data as { intents?: unknown; hasMore?: boolean };
  if (!Array.isArray(value.intents) || !value.intents.every(validPaymentIntent)) throw new Error('Unable to recover payment orders');
  return { intents: value.intents, hasMore: value.hasMore === true };
}
export async function confirmTonPayment(intent: TonPaymentIntent): Promise<'pending' | 'confirmed'> {
  const response = await httpClient.post('/api/wallet/payments/confirm', { provider: 'ton', transactionId: intent.transactionId, amount: intent.amountNano / 1_000_000_000, asset: 'TON' });
  return paymentResult(response.status, response.data, intent.transactionId);
}
