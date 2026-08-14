import { asArrayBuffer, constantTimeEqual, fromBase64Url, toBase64Url, utf8 } from './encoding.ts';
import type { RedisCommands } from './productionStorage.ts';
import type { SessionClaims } from './types.ts';

export const REQUEST_WINDOW_MS = 30_000;
const NONCE_TTL_MS = 120_000;

async function hmac(value: string, secret: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, asArrayBuffer(utf8(value))));
}

async function sha256(value: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', asArrayBuffer(utf8(value)))));
}

export async function deriveSessionKey(claims: Pick<SessionClaims, 'sub' | 'iat'>, jwtSecret: string): Promise<string> {
  return toBase64Url(await hmac(`mtx-request-v1\n${claims.sub}\n${claims.iat}`, utf8(jwtSecret)));
}

export async function createRequestSignature(method: string, pathname: string, timestamp: string, nonce: string, body: string, sessionKey: string): Promise<string> {
  const canonical = `${method.toUpperCase()}\n${pathname}\n${timestamp}\n${nonce}\n${await sha256(body)}`;
  return toBase64Url(await hmac(canonical, fromBase64Url(sessionKey)));
}

export interface ReplayProtection { consume(userId: string, nonce: string, ttlMs?: number): Promise<boolean>; }

export class MemoryReplayProtection implements ReplayProtection {
  private readonly seen = new Map<string, number>();
  async consume(userId: string, nonce: string, ttlMs = NONCE_TTL_MS): Promise<boolean> {
    const now = Date.now();
    for (const [key, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(key);
    const key = `${userId}:${nonce}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + ttlMs);
    return true;
  }
}

export class RedisReplayProtection implements ReplayProtection {
  private readonly redis: RedisCommands;
  constructor(redis: RedisCommands) { this.redis = redis; }
  async consume(userId: string, nonce: string, ttlMs = NONCE_TTL_MS): Promise<boolean> {
    const result = await this.redis.command<string | null>(['SET', `mtx:nonce:${userId}:${nonce}`, '1', 'NX', 'PX', String(ttlMs)]);
    return result === 'OK';
  }
}

export type RequestSecurityFailure = 'missing_signature' | 'stale_timestamp' | 'invalid_nonce' | 'forged_signature' | 'replayed_request';

export async function validateSignedRequest(request: Request, claims: SessionClaims, jwtSecret: string, replay: ReplayProtection, now = Date.now()): Promise<RequestSecurityFailure | null> {
  const timestamp = request.headers.get('x-mtx-timestamp');
  const nonce = request.headers.get('x-mtx-nonce');
  const signature = request.headers.get('x-mtx-signature');
  if (!timestamp || !nonce || !signature) return 'missing_signature';
  const parsedTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(parsedTimestamp) || Math.abs(now - parsedTimestamp) > REQUEST_WINDOW_MS) return 'stale_timestamp';
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) return 'invalid_nonce';
  const body = await request.clone().text();
  const expected = await createRequestSignature(request.method, new URL(request.url).pathname, timestamp, nonce, body, await deriveSessionKey(claims, jwtSecret));
  let matches = false;
  try { matches = constantTimeEqual(fromBase64Url(signature), fromBase64Url(expected)); } catch { matches = false; }
  if (!matches) return 'forged_signature';
  return await replay.consume(claims.sub, nonce) ? null : 'replayed_request';
}

export interface AnomalyRecord { userId: string; type: string; at: number; details?: Record<string, string | number | boolean>; }
export class AntiCheatMonitor {
  private readonly records: AnomalyRecord[] = [];
  flag(userId: string, type: string, details?: AnomalyRecord['details']): void { this.records.unshift({ userId, type, at: Date.now(), details }); if (this.records.length > 1_000) this.records.length = 1_000; }
  snapshot(): readonly AnomalyRecord[] { return this.records.map((record) => ({ ...record, details: record.details ? { ...record.details } : undefined })); }
}
