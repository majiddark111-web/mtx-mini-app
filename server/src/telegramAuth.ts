import { asArrayBuffer, bytesToHex, constantTimeEqual, hexToBytes, utf8 } from './encoding.ts';
import { telegramUserSchema } from './schema.ts';
import type { AuthenticatedUser } from './types.ts';

async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? utf8(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', asArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, asArrayBuffer(utf8(value))));
}

export async function createTelegramHash(initDataWithoutHash: URLSearchParams, botToken: string): Promise<string> {
  const dataCheckString = [...initDataWithoutHash.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = await hmac('WebAppData', botToken);
  return bytesToHex(await hmac(secretKey, dataCheckString));
}

export async function validateTelegramInitData(rawInitData: string, botToken: string, maximumAgeSeconds: number, nowSeconds = Math.floor(Date.now() / 1_000)): Promise<AuthenticatedUser> {
  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get('hash');
  if (!receivedHash) throw new Error('Telegram signature is missing');
  params.delete('hash');
  const calculatedHash = await createTelegramHash(params, botToken);
  if (!constantTimeEqual(hexToBytes(receivedHash), hexToBytes(calculatedHash))) throw new Error('Telegram signature is invalid');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 30 || nowSeconds - authDate > maximumAgeSeconds) throw new Error('Telegram session has expired');
  const serializedUser = params.get('user');
  if (!serializedUser) throw new Error('Telegram user is missing');
  let user: unknown;
  try { user = JSON.parse(serializedUser); } catch { throw new Error('Telegram user is invalid'); }
  return telegramUserSchema.parse(user);
}
