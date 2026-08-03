import { issueJwt, verifyJwt } from './jwt.ts';
import { applyOfflineProfit, applyTapBatch } from './gameEngine.ts';
import { GameStorage } from './gameStorage.ts';
import { RateLimiter } from './rateLimiter.ts';
import { authRequestSchema, emptyQuerySchema, tapBatchSchema, ValidationError } from './schema.ts';
import { validateTelegramInitData } from './telegramAuth.ts';
import { loadEconomyConfig } from './economyConfigProvider.ts';
import type { Env } from './types.ts';

const ipLimiter = new RateLimiter(60, 60_000);
const userLimiter = new RateLimiter(120, 60_000);
const defaultGameStorage = new GameStorage();

const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders } });
const clientIp = (request: Request): string => request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('origin');
  return origin === env.APP_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' } : {};
}

function validateEnv(env: Env): void {
  if (env.TELEGRAM_BOT_TOKEN.length < 10) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  if (env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  if (!/^https?:\/\//.test(env.APP_ORIGIN)) throw new Error('APP_ORIGIN is not configured');
  const maximumAge = Number(env.AUTH_MAX_AGE_SECONDS ?? '300');
  if (!Number.isSafeInteger(maximumAge) || maximumAge < 60 || maximumAge > 3_600) throw new Error('AUTH_MAX_AGE_SECONDS is invalid');
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  return handleRequestWithStorage(request, env, defaultGameStorage);
}

async function authenticatedUserId(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const claims = await verifyJwt(authorization.slice(7), env.JWT_SECRET);
  return claims.sub;
}

export async function handleRequestWithStorage(request: Request, env: Env, gameStorage: GameStorage): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try { validateEnv(env); } catch { return json({ error: 'Server configuration error' }, 500, cors); }
  const origin = request.headers.get('origin');
  if (origin && origin !== env.APP_ORIGIN) return json({ error: 'Forbidden origin' }, 403);
  if (!ipLimiter.consume(`ip:${clientIp(request)}`)) return json({ error: 'Too many requests' }, 429, cors);
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/auth/telegram' && request.method === 'POST') {
      const body = authRequestSchema.parse(await request.json());
      const maximumAge = Number(env.AUTH_MAX_AGE_SECONDS ?? '300');
      const user = await validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN, maximumAge);
      const token = await issueJwt(user, env.JWT_SECRET);
      return json({ token, user }, 200, cors);
    }
    if (url.pathname === '/api/session' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors);
      const claims = await verifyJwt(authorization.slice(7), env.JWT_SECRET);
      if (!userLimiter.consume(`user:${claims.sub}`)) return json({ error: 'Too many requests' }, 429, cors);
      return json({ user: claims.user }, 200, cors);
    }
    if (url.pathname === '/api/game/state' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      if (!userLimiter.consume(`user:${userId}`)) return json({ error: 'Too many requests' }, 429, cors);
      const current = await gameStorage.stateFor(userId, Date.now());
      const result = applyOfflineProfit(current, Date.now(), await loadEconomyConfig(env));
      gameStorage.saveHot(result.state);
      return json({ state: result.state, offlineProfit: result.offlineProfit }, 200, cors);
    }
    if (url.pathname === '/api/economy/config' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ economy: await loadEconomyConfig(env) }, 200, cors);
    }
    if (url.pathname === '/api/game/taps' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      if (!userLimiter.consume(`user:${userId}`)) return json({ error: 'Too many requests' }, 429, cors);
      const batch = tapBatchSchema.parse(await request.json());
      const now = Date.now();
      const current = await gameStorage.stateFor(userId, now);
      if (gameStorage.isProcessed(userId, batch.batchId)) return json({ state: current, acceptedTaps: 0, duplicate: true }, 200, cors);
      const result = applyTapBatch(current, batch, now);
      gameStorage.markProcessed(userId, batch.batchId, now);
      gameStorage.saveHot(result.state);
      await gameStorage.queue.enqueue({ userId, batch, acceptedTaps: result.acceptedTaps, receivedAt: now });
      if (result.flagged) return json({ error: 'Implausible tap rate', flagged: true, state: result.state }, 422, cors);
      return json({ state: result.state, acceptedTaps: result.acceptedTaps, duplicate: false }, 200, cors);
    }
    return json({ error: 'Not found' }, 404, cors);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: 'Invalid request' }, 400, cors);
    return json({ error: 'Unauthorized' }, 401, cors);
  }
}
