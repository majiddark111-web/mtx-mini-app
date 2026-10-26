import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finishPaymentRequest, paymentRequest, paymentResult, pendingPayments, preparePaymentOrder, removeConfirmedPayment, savePendingPayment, type PaymentStorage } from './pendingPaymentService.ts';

class Storage implements PaymentStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const order = { transactionId: 'ton_1234567890abcdef1234567890abcdef', recipient: '0QD5l1aVXwQxVyvdvv_cAXEH89_9PI8blYMPElwWMQP27wKh', amountNano: 10_000_000, creditedCoins: 100, expiresAt: 1000 };

describe('durable client payment recovery', () => {
  it('only returns a wallet-ready order after both server creation and local persistence', async () => {
    const storage = new Storage();
    const prepared = await preparePaymentOrder(storage, '42', 'wallet', async (_source, key) => {
      assert.equal(paymentRequest(storage, '42', 'wallet').idempotencyKey, key);
      assert.deepEqual(pendingPayments(storage, '42'), []);
      return order;
    });
    assert.deepEqual(prepared, order);
    assert.deepEqual(pendingPayments(storage, '42'), [order]);
    assert.equal(storage.getItem('mtx.ton.pending.v2:42:request'), null);
  });
  it('keeps the same request after a lost server response or a failed local order save', async () => {
    const storage = new Storage();
    const request = paymentRequest(storage, '42', 'wallet');
    await assert.rejects(preparePaymentOrder(storage, '42', 'wallet', async () => { throw new Error('timeout'); }), /timeout/);
    const failedSave: PaymentStorage = { getItem: (key) => storage.getItem(key), setItem: () => { throw new Error('quota'); }, removeItem: (key) => storage.removeItem(key) };
    await assert.rejects(preparePaymentOrder(failedSave, '42', 'wallet', async () => order), /quota/);
    assert.deepEqual(paymentRequest(storage, '42', 'wallet'), request);
    assert.deepEqual(pendingPayments(storage, '42'), []);
    const recovered = await preparePaymentOrder(storage, '42', 'wallet', async (_source, key) => {
      assert.equal(key, request.idempotencyKey);
      return { ...order, replayed: true };
    });
    assert.equal(recovered.replayed, true);
  });
  it('keeps expired orders across reopen and never shares them with another account', () => {
    const storage = new Storage(); savePendingPayment(storage, '42', order);
    assert.deepEqual(pendingPayments(storage, '42'), [order]);
    assert.deepEqual(pendingPayments(storage, 'other'), []);
    assert.throws(() => pendingPayments(storage, ''));
  });
  it('saves once per order and only removes the specifically confirmed order', () => {
    const storage = new Storage(); savePendingPayment(storage, '42', order); savePendingPayment(storage, '42', order);
    const second = { ...order, transactionId: 'ton_abcdef1234567890abcdef1234567890' }; savePendingPayment(storage, '42', second);
    removeConfirmedPayment(storage, '42', order.transactionId);
    assert.deepEqual(pendingPayments(storage, '42'), [second]);
  });
  it('retains an idempotency key after an unknown create outcome and rotates only after saving the order', () => {
    const storage = new Storage(); const request = paymentRequest(storage, '42', 'wallet');
    assert.deepEqual(paymentRequest(storage, '42', 'wallet'), request);
    assert.throws(() => paymentRequest(storage, '42', 'another-wallet'));
    savePendingPayment(storage, '42', order); finishPaymentRequest(storage, '42');
    assert.notEqual(paymentRequest(storage, '42', 'wallet').idempotencyKey, request.idempotencyKey);
  });
  it('does not erase damaged data or hide a storage failure', () => {
    const storage = new Storage(); storage.setItem('mtx.ton.pending.v2:42', 'damaged');
    assert.throws(() => pendingPayments(storage, '42'));
    assert.equal(storage.getItem('mtx.ton.pending.v2:42'), 'damaged');
    const unavailable = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    assert.throws(() => savePendingPayment(unavailable, '42', order), /quota/);
    assert.throws(() => paymentRequest(unavailable, '42', 'wallet'), /quota/);
  });
  it('requires explicit confirmation of this exact order, not just HTTP 200', () => {
    assert.equal(paymentResult(202, { status: 'pending' }, order.transactionId), 'pending');
    assert.equal(paymentResult(200, { transaction: { transactionId: order.transactionId, status: 'confirmed' } }, order.transactionId), 'confirmed');
    for (const status of ['failed', 'pending', 'refunded']) assert.throws(() => paymentResult(200, { transaction: { transactionId: order.transactionId, status } }, order.transactionId));
    assert.throws(() => paymentResult(200, {}, order.transactionId));
    assert.throws(() => paymentResult(200, { transaction: { transactionId: 'other', status: 'confirmed' } }, order.transactionId));
    assert.throws(() => paymentResult(500, {}, order.transactionId));
  });
});
