import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequestWithStorage } from './app.ts';
import { CommerceStorage, MemoryCommercePersistence, type PaymentIntent } from './commerce.ts';
import { GameStorage } from './gameStorage.ts';
import { issueJwt } from './jwt.ts';
import { createRequestSignature, deriveSessionKey } from './requestSecurity.ts';
import type { Env } from './types.ts';

const source = '0QDQ8n2pcAfapcoqu_V5u6rn0fIkjwGVu7Trz6vinUsiD-0o';
const recipient = '0QD5l1aVXwQxVyvdvv_cAXEH89_9PI8blYMPElwWMQP27wKh';
function setup() {
  const persistence = new MemoryCommercePersistence();
  const commerce = new CommerceStorage(persistence); const game = new GameStorage();
  let verified = false; let calls = 0;
  const inputs: unknown[] = [];
  const env: Env = { TELEGRAM_BOT_TOKEN: 'test-bot-token', JWT_SECRET: 'test-secret-more-than-thirty-two-characters', APP_ORIGIN: 'https://play.test', TON_TREASURY_ADDRESS: recipient, TON_PAYMENT_AMOUNT_NANO: 10_000_000, TON_PAYMENT_CREDIT_MTX: 100,
    PAYMENT_VERIFIER: { async verify(input) { calls++; inputs.push(input); return { verified, status: verified ? 'confirmed' : 'pending', creditedCoins: 999 }; } } };
  const send = async (method: string, path: string, body?: unknown, userId = '42', storage = commerce) => {
    const now = Math.floor(Date.now() / 1000); const token = await issueJwt({ id: userId, firstName: 'Test' }, env.JWT_SECRET, 900, now);
    const key = await deriveSessionKey({ sub: userId, iat: now }, env.JWT_SECRET);
    const serialized = body === undefined ? '' : JSON.stringify(body); const nonce = crypto.randomUUID(); const timestamp = String(Date.now());
    const signature = await createRequestSignature(method, path, timestamp, nonce, serialized, key);
    return handleRequestWithStorage(new Request('https://api.test' + path, { method, body: method === 'GET' ? undefined : serialized, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', origin: env.APP_ORIGIN, 'cf-connecting-ip': crypto.randomUUID(), 'x-mtx-timestamp': timestamp, 'x-mtx-nonce': nonce, 'x-mtx-signature': signature } }), env, game, storage);
  };
  const create = (idempotencyKey = 'payment-request-0001') => send('POST', '/api/wallet/payments/intents', { sourceAddress: source, idempotencyKey });
  const confirm = (transactionId: string, userId = '42', amount = 0.01) => send('POST', '/api/wallet/payments/confirm', { provider: 'ton', asset: 'TON', amount, transactionId }, userId);
  return { persistence, commerce, game, env, send, create, confirm, inputs, verify: () => { verified = true; }, calls: () => calls };
}

describe('recoverable payment API', () => {
  it('rejects recovery without authentication', async () => {
    const app = setup();
    const response = await handleRequestWithStorage(new Request('https://api.test/api/wallet/payments/intents', { headers: { origin: app.env.APP_ORIGIN } }), app.env, app.game, app.commerce);
    assert.equal(response.status, 401);
  });
  it('imports a still-present legacy Redis intent once and keeps it after Redis disappears', async () => {
    const app = setup();
    const transactionId = 'ton_abcdefabcdefabcdefabcdefabcdefab';
    const legacy = { userId: '42', sourceAddress: source, amountNano: 10_000_000, creditedCoins: 100, createdAt: Date.now() };
    app.env.REDIS = { async command<T>(parts: string[]): Promise<T> {
      if (parts[0] === 'GET' && parts[1] === 'mtx:payment-intent:' + transactionId) return JSON.stringify(legacy) as T;
      if (parts[0] === 'SET') return 'OK' as T;
      return null as T;
    } };
    assert.equal((await app.confirm(transactionId, 'other')).status, 409);
    assert.equal(await app.commerce.paymentIntent(transactionId), undefined);
    assert.equal((await app.confirm(transactionId)).status, 202);
    assert.ok(await app.commerce.paymentIntent(transactionId));
    delete app.env.REDIS;
    app.verify();
    assert.equal((await app.confirm(transactionId)).status, 200);
    assert.equal((await app.game.stateFor('42', Date.now())).coins, 100);
  });
  it('recovers the same order after a lost create response without requiring Redis', async () => {
    const app = setup(); const first = await (await app.create()).json(); const retry = await app.create();
    assert.equal(retry.status, 200); assert.equal((await retry.json()).transactionId, first.transactionId);
    const afterRestart = new CommerceStorage(app.persistence);
    const recovered = await app.send('GET', '/api/wallet/payments/intents', undefined, '42', afterRestart);
    assert.equal((await recovered.json()).intents[0].transactionId, first.transactionId);
    assert.equal((await app.commerce.pendingPaymentIntents('42')).length, 1);
  });
  it('does not expose another user order or accept a forged amount', async () => {
    const app = setup(); const intent = await (await app.create()).json();
    assert.equal((await app.confirm(intent.transactionId, 'other')).status, 409);
    assert.equal((await app.confirm(intent.transactionId, '42', 99)).status, 409);
    assert.equal(app.calls(), 0);
    const other = await app.send('GET', '/api/wallet/payments/intents', undefined, 'other');
    assert.deepEqual((await other.json()).intents, []);
  });
  it('retains an expired order through pending verification and confirms it once using the original quote', async () => {
    const app = setup(); const at = Date.now() - 86_400_000;
    const intent: PaymentIntent = { transactionId: 'ton_1234567890abcdef1234567890abcdef', userId: '42', sourceAddress: source, recipient, amountNano: 10_000_000, creditedCoins: 100, createdAt: at, expiresAt: at + 900_000, idempotencyKey: 'old-request-0001' };
    await app.commerce.savePaymentIntent(intent);
    assert.equal((await app.confirm(intent.transactionId)).status, 202);
    assert.equal((await app.commerce.pendingPaymentIntents('42')).length, 1);
    app.env.TON_PAYMENT_CREDIT_MTX = 900; app.env.TON_PAYMENT_AMOUNT_NANO = 900_000_000;
    app.verify();
    const first = await app.confirm(intent.transactionId); assert.equal(first.status, 200);
    assert.equal((await first.json()).transaction.creditedCoins, 100);
    const again = await app.confirm(intent.transactionId); assert.equal((await again.json()).duplicate, true);
    assert.equal((await app.game.stateFor('42', Date.now())).coins, 100);
    assert.equal(app.calls(), 2);
    assert.equal((await app.commerce.pendingPaymentIntents('42')).length, 0);
    assert.ok(await app.commerce.paymentIntent(intent.transactionId), 'audit record remains');
  });
  it('retains an order when chain verification times out', async () => {
    const app = setup(); const intent = await (await app.create()).json();
    app.env.PAYMENT_VERIFIER = { async verify() { throw new Error('timeout'); } };
    assert.equal((await app.confirm(intent.transactionId)).status, 500);
    assert.equal((await app.commerce.pendingPaymentIntents('42')).length, 1);
    assert.equal((await app.game.stateFor('42', Date.now())).coins, 0);
  });
  it('rejects the same request key reused for a different source wallet', async () => {
    const app = setup(); await app.create();
    const result = await app.send('POST', '/api/wallet/payments/intents', { sourceAddress: recipient, idempotencyKey: 'payment-request-0001' });
    assert.equal(result.status, 409);
  });
  it('does not return a sendable order when persistence fails', async () => {
    const app = setup();
    class FailingPersistence extends MemoryCommercePersistence { override async savePaymentIntent(): Promise<PaymentIntent> { throw new Error('database unavailable'); } }
    const result = await app.send('POST', '/api/wallet/payments/intents', { sourceAddress: source }, '42', new CommerceStorage(new FailingPersistence()));
    assert.equal(result.status, 500); assert.equal((await result.json()).transactionId, undefined);
  });
  it('never converts an unverified failed provider result into a completed payment', async () => {
    const app = setup(); const intent = await (await app.create()).json();
    app.env.PAYMENT_VERIFIER = { async verify() { return { verified: false, status: 'failed', creditedCoins: 0 }; } };
    assert.equal((await app.confirm(intent.transactionId)).status, 202);
    assert.equal(await app.commerce.payment(intent.transactionId), undefined);
  });
});
