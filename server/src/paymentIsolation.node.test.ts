import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequestWithStorage } from './app.ts';
import { CommerceStorage, MemoryCommercePersistence, type PaymentRecord } from './commerce.ts';
import { GameStorage } from './gameStorage.ts';
import { SocialStorage } from './social.ts';
import { AdminStorage } from './admin.ts';
import { issueJwt } from './jwt.ts';
import { AntiCheatMonitor, createRequestSignature, deriveSessionKey, MemoryReplayProtection } from './requestSecurity.ts';
import { RateLimiter } from './rateLimiter.ts';
import type { Env } from './types.ts';

const source = '0QDQ8n2pcAfapcoqu_V5u6rn0fIkjwGVu7Trz6vinUsiD-0o';
const treasury = '0QD5l1aVXwQxVyvdvv_cAXEH89_9PI8blYMPElwWMQP27wKh';
const intentPath = '/api/wallet/payments/intents';
const confirmPath = '/api/wallet/payments/confirm';
type Credentials = { expired?: boolean; unsigned?: boolean; anonymous?: boolean; nonce?: string; keyUser?: string };

// Synthetic users, isolated memory adapters and a fake verifier: no network or database.
function fixture(persistence = new MemoryCommercePersistence()) {
  const game = new GameStorage();
  const commerce = new CommerceStorage(persistence);
  const social = new SocialStorage();
  const admin = new AdminStorage();
  const replay = new MemoryReplayProtection();
  const monitor = new AntiCheatMonitor();
  const ipLimit = new RateLimiter(60, 60_000);
  const userLimit = new RateLimiter(120, 60_000);
  let verifications = 0;
  const env: Env = {
    TELEGRAM_BOT_TOKEN: 'synthetic-test-bot-token', JWT_SECRET: 'synthetic-payment-review-secret-at-least-32',
    APP_ORIGIN: 'https://play.example.test', TON_TREASURY_ADDRESS: treasury,
    TON_PAYMENT_AMOUNT_NANO: 10_000_000, TON_PAYMENT_CREDIT_MTX: 100,
    PAYMENT_VERIFIER: { async verify() { verifications++; return { verified: true, status: 'confirmed', creditedCoins: 999 }; } },
  };
  const send = async (userId: string, path: string, body?: unknown, options: Credentials = {}) => {
    const issuedAt = Math.floor(Date.now() / 1000) - (options.expired ? 1000 : 0);
    const token = await issueJwt({ id: userId, firstName: 'Synthetic' }, env.JWT_SECRET, 900, issuedAt);
    const key = await deriveSessionKey({ sub: options.keyUser ?? userId, iat: issuedAt }, env.JWT_SECRET);
    const method = body === undefined ? 'GET' : 'POST';
    const serialized = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = options.nonce ?? crypto.randomUUID();
    const headers = new Headers({ origin: env.APP_ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.20' });
    if (!options.anonymous) headers.set('authorization', `Bearer ${token}`);
    if (!options.unsigned) {
      headers.set('x-mtx-timestamp', timestamp);
      headers.set('x-mtx-nonce', nonce);
      headers.set('x-mtx-signature', await createRequestSignature(method, new URL(path, 'https://api.example.test').pathname, timestamp, nonce, serialized, key));
    }
    return handleRequestWithStorage(new Request('https://api.example.test' + path, { method, headers, body: body === undefined ? undefined : serialized }), env, game, commerce, social, admin, replay, monitor, ipLimit, userLimit);
  };
  const create = async (userId = 'alice', idempotencyKey = 'synthetic-payment-0001') => {
    const response = await send(userId, intentPath, { sourceAddress: source, idempotencyKey });
    assert.ok([200, 201].includes(response.status));
    return await response.json() as { transactionId: string };
  };
  const bodyFor = (transactionId: string) => ({ provider: 'ton', asset: 'TON', amount: 0.01, transactionId });
  const confirm = (transactionId: string, userId = 'alice', options: Credentials = {}) => send(userId, confirmPath, bodyFor(transactionId), options);
  return { game, commerce, admin, env, send, create, confirm, bodyFor, calls: () => verifications };
}

describe('payment authorization and isolation (local memory adapters)', () => {
  it('credits one order once across 16 concurrent confirmations and a later retry', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    const responses = await Promise.all(Array.from({ length: 16 }, () => app.confirm(transactionId)));
    assert.ok(responses.every(response => response.status === 200));
    const results = await Promise.all(responses.map(response => response.json()));
    assert.equal(results.filter(result => result.duplicate === false).length, 1);
    assert.equal((await (await app.confirm(transactionId)).json()).duplicate, true);
    assert.equal((await app.game.stateFor('alice', Date.now())).coins, 100);
    assert.equal((await app.commerce.paymentHistory('alice')).length, 1);
  });

  it('denies another user both before and after the owner confirms the order', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    for (const completed of [false, true]) {
      if (completed) assert.equal((await app.confirm(transactionId)).status, 200);
      const calls = app.calls();
      const denied = await app.confirm(transactionId, 'bob');
      assert.equal(denied.status, 409);
      assert.equal((await denied.json()).transaction, undefined);
      assert.equal(app.calls(), calls, 'foreign orders must not reach chain verification');
    }
    assert.equal((await app.game.stateFor('bob', Date.now())).coins, 0);
  });

  it('scopes identical creation keys to their respective users', async () => {
    const app = fixture();
    const [alice, bob] = await Promise.all([app.create('alice'), app.create('bob')]);
    assert.notEqual(alice.transactionId, bob.transactionId);
    const responses = await Promise.all([app.confirm(alice.transactionId), app.confirm(bob.transactionId, 'bob')]);
    assert.ok(responses.every(response => response.status === 200));
    for (const user of ['alice', 'bob']) {
      assert.equal((await app.game.stateFor(user, Date.now())).coins, 100);
      assert.equal((await app.commerce.paymentHistory(user)).length, 1);
    }
  });

  it('returns one stored intent for concurrent create retries in the memory adapter', async () => {
    const app = fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => app.create()));
    assert.equal(new Set(results.map(result => result.transactionId)).size, 1);
    assert.equal((await app.commerce.pendingPaymentIntents('alice')).length, 1);
  });

  it('does not expose payments through wallet, history, notifications or profile to another user', async () => {
    const app = fixture();
    const confirmed = await app.create();
    const pending = await app.create('alice', 'synthetic-payment-0002');
    assert.equal((await app.confirm(confirmed.transactionId)).status, 200);
    for (const path of ['/api/wallet/transactions', '/api/history', '/api/notifications', '/api/profile', intentPath]) {
      const owner = await app.send('alice', path);
      assert.equal(owner.status, 200);
      assert.ok((await owner.text()).includes(path === intentPath ? pending.transactionId : confirmed.transactionId), path);
      const other = await app.send('bob', path);
      assert.equal(other.status, 200);
      const text = await other.text();
      assert.equal(text.includes(confirmed.transactionId), false, path);
      assert.equal(text.includes(pending.transactionId), false, path);
    }
  });

  for (const [label, options] of Object.entries({ anonymous: { anonymous: true }, expired: { expired: true }, unsigned: { unsigned: true }, mixedIdentity: { keyUser: 'bob' } })) {
    it(`rejects ${label} payment requests before verification or credit`, async () => {
      const app = fixture();
      const { transactionId } = await app.create();
      assert.equal((await app.send('alice', intentPath, undefined, options)).status, 401);
      assert.equal((await app.send('alice', intentPath, { sourceAddress: source }, options)).status, 401);
      assert.equal((await app.confirm(transactionId, 'alice', options)).status, 401);
      assert.equal(app.calls(), 0);
      assert.equal((await app.game.stateFor('alice', Date.now())).coins, 0);
      assert.equal((await app.commerce.pendingPaymentIntents('alice')).length, 1);
    });
  }

  it('blocks banned accounts from creating, listing or confirming orders', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    await app.admin.ban('synthetic-admin', 'alice');
    assert.equal((await app.send('alice', intentPath)).status, 403);
    assert.equal((await app.send('alice', intentPath, { sourceAddress: source })).status, 403);
    assert.equal((await app.confirm(transactionId)).status, 403);
    assert.equal(app.calls(), 0);
  });

  it('rejects forged reward, status, ownership and amount without invoking the verifier', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    for (const change of [{ creditedCoins: 999999 }, { status: 'confirmed' }, { userId: 'bob' }, { amount: 99 }]) {
      const result = await app.send('alice', confirmPath, { ...app.bodyFor(transactionId), ...change });
      assert.equal(result.status, 'amount' in change ? 409 : 400);
    }
    assert.equal(app.calls(), 0);
    assert.equal((await app.game.stateFor('alice', Date.now())).coins, 0);
  });

  it('rejects query-supplied identity on payment lists and history', async () => {
    const app = fixture();
    for (const path of [intentPath, '/api/wallet/transactions', '/api/history']) {
      assert.equal((await app.send('bob', path + '?userId=alice')).status, 400);
    }
  });

  it('rejects nonce replay but accepts a newly signed idempotent retry without extra credit', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    const nonce = 'synthetic-payment-replay-0001';
    assert.equal((await app.confirm(transactionId, 'alice', { nonce })).status, 200);
    assert.equal((await app.confirm(transactionId, 'alice', { nonce })).status, 409);
    assert.equal((await (await app.confirm(transactionId)).json()).duplicate, true);
    assert.equal((await app.game.stateFor('alice', Date.now())).coins, 100);
  });

  it('requires both verified evidence and confirmed status', async () => {
    const app = fixture();
    const { transactionId } = await app.create();
    for (const result of [{ verified: false, status: 'confirmed' as const }, { verified: true, status: 'pending' as const }, { verified: true, status: 'failed' as const }]) {
      app.env.PAYMENT_VERIFIER = { async verify() { return { ...result, creditedCoins: 999 }; } };
      assert.equal((await app.confirm(transactionId)).status, 202);
      assert.equal(await app.commerce.payment(transactionId), undefined);
      assert.equal((await app.game.stateFor('alice', Date.now())).coins, 0);
    }
  });

  it('does not update the balance when payment persistence fails, and permits safe recovery', async () => {
    class FailingOncePersistence extends MemoryCommercePersistence {
      fail = true;
      override async commitPayment(...args: Parameters<MemoryCommercePersistence['commitPayment']>) {
        if (this.fail) { this.fail = false; throw new Error('synthetic-write-failure'); }
        return super.commitPayment(...args);
      }
    }
    const app = fixture(new FailingOncePersistence());
    const { transactionId } = await app.create();
    assert.equal((await app.confirm(transactionId)).status, 500);
    assert.equal((await app.game.stateFor('alice', Date.now())).coins, 0);
    assert.equal(await app.commerce.payment(transactionId), undefined);
    assert.equal((await app.commerce.pendingPaymentIntents('alice')).length, 1);
    assert.equal((await app.confirm(transactionId)).status, 200);
    assert.equal((await app.game.stateFor('alice', Date.now())).coins, 100);
    assert.equal((await app.commerce.paymentHistory('alice')).length, 1);
  });

  it('does not reveal a stored foreign payment even when no intent is available', async () => {
    const persistence = new MemoryCommercePersistence();
    const app = fixture(persistence);
    const state = await app.game.stateFor('alice', Date.now());
    const record: PaymentRecord = { transactionId: 'synthetic-legacy-payment-0001', userId: 'alice', provider: 'ton', asset: 'TON', amount: 0.01, creditedCoins: 100, status: 'confirmed', createdAt: Date.now() };
    await persistence.commitPayment(record, state.version, state);
    const response = await app.confirm(record.transactionId, 'bob');
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'Transaction already used' });
    assert.equal(app.calls(), 0);
  });
});
