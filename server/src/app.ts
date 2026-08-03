import { issueJwt, verifyJwt } from './jwt.ts';
import { RateLimiter } from './rateLimiter.ts';
import { authRequestSchema, emptyQuerySchema, ValidationError } from './schema.ts';
import { validateTelegramInitData } from './telegramAuth.ts';
import type { Env } from './types.ts';

const ipLimiter = new RateLimiter(60, 60_000);
const userLimiter = new RateLimiter(120, 60_000);

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
    return json({ error: 'Not found' }, 404, cors);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: 'Invalid request' }, 400, cors);
    return json({ error: 'Unauthorized' }, 401, cors);
  }
}
