import { Address, Cell } from '@ton/core';

const sameAddress = (left, right) => {
  try { return Address.parse(left).equals(Address.parse(right)); }
  catch { return false; }
};

export function decodeTonComment(body) {
  try {
    const slice = Cell.fromBase64(body).beginParse();
    if (slice.loadUint(32) !== 0) return '';
    return slice.loadStringTail();
  } catch { return ''; }
}

export function createTonPaymentVerifier({ apiKey, baseUrl, treasuryAddress, amountNano, creditedCoins, fetchImplementation = globalThis.fetch }) {
  Address.parse(treasuryAddress);
  return {
    async verify(input) {
      const url = new URL('/api/v3/messages', baseUrl);
      url.searchParams.set('source', input.sourceAddress);
      url.searchParams.set('destination', treasuryAddress);
      url.searchParams.set('start_utime', String(Math.floor(input.createdAt / 1_000) - 30));
      url.searchParams.set('limit', '100');
      url.searchParams.set('sort', 'desc');
      const response = await fetchImplementation(url, { headers: { accept: 'application/json', 'x-api-key': apiKey }, signal: globalThis.AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`TON Center verification failed (${response.status})`);
      const payload = await response.json();
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const match = messages.find((message) => sameAddress(message.source, input.sourceAddress)
        && sameAddress(message.destination, treasuryAddress)
        && String(message.value) === String(amountNano)
        && message.bounced !== true
        && decodeTonComment(message.message_content?.body ?? '') === input.transactionId);
      return match ? { verified: true, creditedCoins, status: 'confirmed' } : { verified: false, creditedCoins: 0, status: 'pending' };
    },
  };
}
