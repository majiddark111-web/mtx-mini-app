export interface TonPaymentIntent { transactionId: string; recipient: string; sourceAddress?: string; amountNano: number; creditedCoins: number; expiresAt: number; replayed?: boolean; }
export interface PaymentStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
const keyFor = (userId: string) => { if (!userId) throw new Error('Sign in before using payments'); return `mtx.ton.pending.v2:${userId}`; };
export function validPaymentIntent(value: unknown): value is TonPaymentIntent {
  if (!value || typeof value !== 'object') return false;
  const item = value as TonPaymentIntent;
  return /^ton_[a-f0-9]{32}$/.test(item.transactionId) && typeof item.recipient === 'string' && item.recipient.length >= 48 && item.recipient.length <= 80 && Number.isSafeInteger(item.amountNano) && item.amountNano > 0 && Number.isSafeInteger(item.creditedCoins) && item.creditedCoins > 0 && Number.isSafeInteger(item.expiresAt) && item.expiresAt > 0;
}
export function pendingPayments(storage: PaymentStorage, userId: string): TonPaymentIntent[] {
  const data: unknown = JSON.parse(storage.getItem(keyFor(userId)) ?? '[]');
  if (!Array.isArray(data) || !data.every(validPaymentIntent)) throw new Error('Stored payment data needs review; do not clear app data');
  // Expiry limits sending a new transaction, not reconciliation of one already sent.
  return data;
}
export function savePendingPayment(storage: PaymentStorage, userId: string, intent: TonPaymentIntent): void {
  if (!validPaymentIntent(intent)) throw new Error('Invalid payment order');
  const values = pendingPayments(storage, userId).filter((item) => item.transactionId !== intent.transactionId);
  values.push(intent);
  storage.setItem(keyFor(userId), JSON.stringify(values));
}
export function removeConfirmedPayment(storage: PaymentStorage, userId: string, transactionId: string): void {
  storage.setItem(keyFor(userId), JSON.stringify(pendingPayments(storage, userId).filter((item) => item.transactionId !== transactionId)));
}
export function paymentRequest(storage: PaymentStorage, userId: string, sourceAddress: string): { idempotencyKey: string; sourceAddress: string } {
  const key = `${keyFor(userId)}:request`;
  const saved = storage.getItem(key);
  if (saved) {
    const request = JSON.parse(saved) as { idempotencyKey: string; sourceAddress: string };
    if (!/^[a-f0-9-]{36}$/.test(request.idempotencyKey) || request.sourceAddress !== sourceAddress) throw new Error('Resolve the previous payment request with its original wallet first');
    return request;
  }
  const request = { idempotencyKey: crypto.randomUUID(), sourceAddress };
  storage.setItem(key, JSON.stringify(request)); return request;
}
export function finishPaymentRequest(storage: PaymentStorage, userId: string): void { storage.removeItem(`${keyFor(userId)}:request`); }
export async function preparePaymentOrder(storage: PaymentStorage, userId: string, sourceAddress: string, create: (sourceAddress: string, idempotencyKey: string) => Promise<TonPaymentIntent>): Promise<TonPaymentIntent> {
  const request = paymentRequest(storage, userId, sourceAddress);
  const intent = await create(request.sourceAddress, request.idempotencyKey);
  // Returning is permission for the caller to open a wallet: both saves must succeed.
  savePendingPayment(storage, userId, intent);
  finishPaymentRequest(storage, userId);
  return intent;
}
export function paymentResult(status: number, data: unknown, expectedId: string): 'pending' | 'confirmed' {
  const body = data as { status?: string; transaction?: { transactionId?: string; status?: string } } | null;
  if (status === 202 && body?.status === 'pending') return 'pending';
  if (status === 200 && body?.transaction?.transactionId === expectedId && body.transaction.status === 'confirmed') return 'confirmed';
  throw new Error('Payment was not confirmed. Keep the order and check again; do not pay again.');
}
