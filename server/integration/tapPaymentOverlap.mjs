import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleRequestWithStorage } from '../src/app.ts';
import { issueJwt } from '../src/jwt.ts';
import { createRequestSignature, deriveSessionKey } from '../src/requestSecurity.ts';
import { CommerceStorage } from '../src/commerce.ts';
import { PostgresCommercePersistence } from '../src/commercePersistence.ts';
import { GameStorage } from '../src/gameStorage.ts';
import { PostgresGameRepository } from '../src/productionStorage.ts';
import { PostgresGameplayPersistence } from '../src/gameplayPersistence.ts';

// Only called inside the disposable schema of the guarded payment recovery runner.
export async function verifyTapPaymentOverlap(db) {
  const user = { id: 'overlap-test-user', firstName: 'Local' };
  const env = {
    TELEGRAM_BOT_TOKEN: 'synthetic-bot-token', JWT_SECRET: 'synthetic-jwt-payment-overlap-secret-only', APP_ORIGIN: 'https://local.example.test',
    TON_PAYMENT_AMOUNT_NANO: 10_000_000, TON_PAYMENT_CREDIT_MTX: 100,
    TON_TREASURY_ADDRESS: '0QD5l1aVXwQxVyvdvv_cAXEH89_9PI8blYMPElwWMQP27wKh',
    PAYMENT_VERIFIER: { async verify() { return { verified: true, status: 'confirmed', creditedCoins: 100 }; } },
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await issueJwt(user, env.JWT_SECRET, 900, issuedAt);
  const key = await deriveSessionKey({ sub: user.id, iat: issuedAt }, env.JWT_SECRET);
  const game = new GameStorage(new PostgresGameRepository(db), undefined, new PostgresGameplayPersistence(db));
  let beforeFirstCommit;
  class InterleavedPaymentStore extends PostgresCommercePersistence {
    async commitPayment(...args) {
      const hook = beforeFirstCommit;
      beforeFirstCommit = undefined;
      if (hook) await hook();
      return super.commitPayment(...args);
    }
  }
  const store = new InterleavedPaymentStore(db);
  const commerce = new CommerceStorage(store);
  const post = async (path, payload) => {
    const body = JSON.stringify(payload), timestamp = String(Date.now()), nonce = randomUUID();
    return handleRequestWithStorage(new Request('https://api.example.test' + path, { method: 'POST', body, headers: {
      origin: env.APP_ORIGIN, 'content-type': 'application/json', authorization: 'Bearer ' + token,
      'x-mtx-timestamp': timestamp, 'x-mtx-nonce': nonce, 'x-mtx-signature': await createRequestSignature('POST', path, timestamp, nonce, body, key),
    } }), env, game, commerce);
  };
  const order = await post('/api/wallet/payments/intents', { sourceAddress: '0QDQ8n2pcAfapcoqu_V5u6rn0fIkjwGVu7Trz6vinUsiD-0o', idempotencyKey: 'overlap-payment-test-01' });
  assert.equal(order.status, 201);
  const { transactionId } = await order.json();
  const confirm = () => post('/api/wallet/payments/confirm', { provider: 'ton', asset: 'TON', transactionId, amount: 0.01 });
  const tap = () => post('/api/game/taps', { batchId: 'overlap-tap-batch-01', taps: 2, durationMs: 1000 });
  // The tap lands after commerce reads its balance, before it tries to commit.
  beforeFirstCommit = async () => {
    const accepted = await tap();
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).acceptedTaps, 2);
  };
  assert.equal((await confirm()).status, 409);
  assert.equal((await game.stateFor(user.id, Date.now())).coins, 2);
  assert.equal(await store.payment(transactionId), undefined);
  assert.deepEqual((await store.pendingPaymentIntents(user.id)).map(order => order.transactionId), [transactionId]);
  const recovered = await confirm();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).duplicate, false);
  for (const retry of [tap, confirm]) {
    const response = await retry();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
  }
  assert.equal((await game.stateFor(user.id, Date.now())).coins, 102);
  assert.equal((await store.paymentHistory(user.id)).length, 1);
  assert.equal((await store.pendingPaymentIntents(user.id)).length, 0);
  const counts = await db.query('SELECT (SELECT count(*) FROM mtx_tap_receipts WHERE user_id=$1)::int AS receipts, (SELECT count(*) FROM mtx_tap_events WHERE user_id=$1)::int AS events', [user.id]);
  assert.deepEqual(counts.rows[0], { receipts: 1, events: 1 });
}
