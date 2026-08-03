import { asArrayBuffer, constantTimeEqual, decodeUtf8, fromBase64Url, toBase64Url, utf8 } from './encoding.ts';
import type { AuthenticatedUser, SessionClaims } from './types.ts';

async function sign(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(utf8(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, asArrayBuffer(utf8(value))));
}

export async function issueJwt(user: AuthenticatedUser, secret: string, lifetimeSeconds = 900, nowSeconds = Math.floor(Date.now() / 1_000)): Promise<string> {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({ sub: user.id, user, iat: nowSeconds, exp: nowSeconds + lifetimeSeconds } satisfies SessionClaims));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${toBase64Url(await sign(unsigned, secret))}`;
}

export async function verifyJwt(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1_000)): Promise<SessionClaims> {
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) throw new Error('Invalid token');
  const parsedHeader = JSON.parse(decodeUtf8(fromBase64Url(header))) as Record<string, unknown>;
  if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') throw new Error('Invalid token');
  if (!constantTimeEqual(fromBase64Url(signature), await sign(`${header}.${payload}`, secret))) throw new Error('Invalid token');
  const claims = JSON.parse(decodeUtf8(fromBase64Url(payload))) as Partial<SessionClaims>;
  if (typeof claims.sub !== 'string' || typeof claims.iat !== 'number' || typeof claims.exp !== 'number' || claims.exp <= nowSeconds || !claims.user || claims.user.id !== claims.sub) throw new Error('Expired or invalid token');
  return claims as SessionClaims;
}
