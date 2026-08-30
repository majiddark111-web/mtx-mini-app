import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Address, beginCell } from '@ton/core';
import { createTonPaymentVerifier, decodeTonComment } from './tonPaymentVerifier.mjs';

const source = '0QDQ8n2pcAfapcoqu_V5u6rn0fIkjwGVu7Trz6vinUsiD-0o';
const treasury = '0QD5l1aVXwQxVyvdvv_cAXEH89_9PI8blYMPElwWMQP27wKh';
const order = 'ton_1234567890abcdef1234567890abcdef';
const commentBody = beginCell().storeUint(0, 32).storeStringTail(order).endCell().toBoc().toString('base64');

describe('TON Testnet payment verification', () => {
  it('decodes the server-issued payment order comment', () => assert.equal(decodeTonComment(commentBody), order));
  it('confirms only the exact sender, treasury, amount and order', async () => {
    const verifier = createTonPaymentVerifier({ apiKey: 'secret', baseUrl: 'https://testnet.toncenter.com', treasuryAddress: treasury, amountNano: 10_000_000, creditedCoins: 100, fetchImplementation: async (url, init) => {
      assert.equal(init.headers['x-api-key'], 'secret');
      assert.equal(new URL(url).searchParams.get('destination'), treasury);
      return new Response(JSON.stringify({ messages: [{ source: Address.parse(source).toRawString(), destination: Address.parse(treasury).toRawString(), value: '10000000', bounced: false, message_content: { body: commentBody } }] }));
    } });
    assert.deepEqual(await verifier.verify({ sourceAddress: source, transactionId: order, createdAt: Date.now() }), { verified: true, creditedCoins: 100, status: 'confirmed' });
  });
  it('keeps an unmatched payment pending without crediting it', async () => {
    const verifier = createTonPaymentVerifier({ apiKey: 'secret', baseUrl: 'https://testnet.toncenter.com', treasuryAddress: treasury, amountNano: 10_000_000, creditedCoins: 100, fetchImplementation: async () => new Response(JSON.stringify({ messages: [] })) });
    assert.deepEqual(await verifier.verify({ sourceAddress: source, transactionId: order, createdAt: Date.now() }), { verified: false, creditedCoins: 0, status: 'pending' });
  });
});
