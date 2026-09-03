import { issueJwt, verifyJwt } from './jwt.ts';
import { applyOfflineProfit, applyTapBatch } from './gameEngine.ts';
import { GameStorage } from './gameStorage.ts';
import { RateLimiter, type RequestRateLimiter } from './rateLimiter.ts';
import { authRequestSchema, emptyQuerySchema, tapBatchSchema, ValidationError } from './schema.ts';
import { validateTelegramInitData } from './telegramAuth.ts';
import { loadEconomyConfig } from './economyConfigProvider.ts';
import { catalogFor, CommerceStorage } from './commerce.ts';
import { inventoryActivationSchema, paymentConfirmationSchema, paymentIntentSchema, purchaseSchema, skinSelectionSchema } from './schema.ts';
import { missionClaimSchema, referralAcceptSchema } from './schema.ts';
import { challengeClaimSchema } from './schema.ts';
import { SocialStorage } from './social.ts';
import { LeaderboardGateway } from './leaderboardGateway.ts';
import { AdminStorage } from './admin.ts';
import { issueAdminJwt, verifyAdminJwt } from './adminAuth.ts';
import { adminBanSchema, adminEventSchema, adminLoginSchema, adminNotificationSchema } from './schema.ts';
import type { Env } from './types.ts';
import { AntiCheatMonitor, deriveSessionKey, MemoryReplayProtection, type ReplayProtection, validateSignedRequest } from './requestSecurity.ts';

const ipLimiter = new RateLimiter(60, 60_000);
const userLimiter = new RateLimiter(120, 60_000);
const defaultGameStorage = new GameStorage();
const defaultCommerceStorage = new CommerceStorage();
const defaultSocialStorage = new SocialStorage();
const defaultAdminStorage = new AdminStorage();
const defaultReplayProtection = new MemoryReplayProtection();
const defaultAntiCheatMonitor = new AntiCheatMonitor();

const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders } });
const clientIp = (request: Request): string => request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('origin');
  return origin === env.APP_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-mtx-timestamp, x-mtx-nonce, x-mtx-signature', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' } : {};
}

export function validateEnv(env: Env): void {
  if (env.TELEGRAM_BOT_TOKEN.length < 10) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  if (env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  if (!/^https?:\/\//.test(env.APP_ORIGIN)) throw new Error('APP_ORIGIN is not configured');
  const maximumAge = Number(env.AUTH_MAX_AGE_SECONDS ?? '300');
  if (!Number.isSafeInteger(maximumAge) || maximumAge < 60 || maximumAge > 3_600) throw new Error('AUTH_MAX_AGE_SECONDS is invalid');
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  return handleRequestWithStorage(request, env, defaultGameStorage, defaultCommerceStorage, defaultSocialStorage, defaultAdminStorage);
}

async function authenticatedUserId(request: Request, env: Env): Promise<string | null> {
  return (await authenticatedPlayer(request, env))?.sub ?? null;
}

async function authenticatedPlayer(request: Request, env: Env) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return verifyJwt(authorization.slice(7), env.JWT_SECRET);
}

const playerName = (player: Awaited<ReturnType<typeof authenticatedPlayer>>): string => player?.user.username || player?.user.firstName || player?.sub || 'MTX player';

export async function handleRequestWithStorage(request: Request, env: Env, gameStorage: GameStorage, commerceStorage: CommerceStorage = defaultCommerceStorage, socialStorage: SocialStorage = defaultSocialStorage, adminStorage: AdminStorage = defaultAdminStorage, replayProtection: ReplayProtection = defaultReplayProtection, antiCheatMonitor: AntiCheatMonitor = defaultAntiCheatMonitor, ipRateLimiter: RequestRateLimiter = ipLimiter, playerRateLimiter: RequestRateLimiter = userLimiter): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try { validateEnv(env); } catch { return json({ error: 'Server configuration error' }, 500, cors); }
  const origin = request.headers.get('origin');
  if (origin && origin !== env.APP_ORIGIN) return json({ error: 'Forbidden origin' }, 403);
  if (!await ipRateLimiter.consume(`ip:${clientIp(request)}`)) return json({ error: 'Too many requests' }, 429, cors);
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/admin/auth' && request.method === 'POST') {
      if (!env.ADMIN_AUTH || !env.ADMIN_JWT_SECRET || env.ADMIN_JWT_SECRET.length < 32) return json({ error: 'Admin authentication unavailable' }, 503, cors);
      const body = adminLoginSchema.parse(await request.json()); const admin = await env.ADMIN_AUTH.verify(body); if (!admin) return json({ error: 'Unauthorized' }, 401, cors); return json({ token: await issueAdminJwt(admin.id, env.ADMIN_JWT_SECRET), admin: { id: admin.id } }, 200, cors);
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!env.ADMIN_JWT_SECRET || env.ADMIN_JWT_SECRET.length < 32) return json({ error: 'Admin authentication unavailable' }, 503, cors);
      const authorization = request.headers.get('authorization'); if (!authorization?.startsWith('Bearer ')) return json({ error: 'Forbidden' }, 403, cors); let admin; try { admin = await verifyAdminJwt(authorization.slice(7), env.ADMIN_JWT_SECRET); } catch { return json({ error: 'Forbidden' }, 403, cors); }
      const users = await gameStorage.stateSnapshot(); const payments = await commerceStorage.allPayments(); const snapshot = await adminStorage.snapshot();
      if (url.pathname === '/api/admin/dashboard' && request.method === 'GET') return json({ stats: { users: users.length, banned: snapshot.banned.length, payments: payments.length, confirmedRevenue: payments.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + item.amount, 0), totalCoins: users.reduce((sum, item) => sum + item.coins, 0) }, recentLogs: snapshot.logs.slice(0, 20) }, 200, cors);
      if (url.pathname === '/api/admin/users' && request.method === 'GET') return json({ users: await Promise.all(users.map(async (user) => ({ ...user, banned: await adminStorage.isBanned(user.userId) }))) }, 200, cors);
      if (url.pathname === '/api/admin/payments' && request.method === 'GET') return json({ payments }, 200, cors);
      if (url.pathname === '/api/admin/items' && request.method === 'GET') { const state = users[0] ?? await gameStorage.stateFor('admin-preview', Date.now()); return json({ items: catalogFor(state, await loadEconomyConfig(env), []) }, 200, cors); }
      if (url.pathname === '/api/admin/logs' && request.method === 'GET') return json({ logs: snapshot.logs }, 200, cors);
      if (url.pathname === '/api/admin/anomalies' && request.method === 'GET') return json({ anomalies: await antiCheatMonitor.snapshot() }, 200, cors);
      if (url.pathname === '/api/admin/notifications' && request.method === 'GET') return json({ notifications: snapshot.notifications }, 200, cors);
      if (url.pathname === '/api/admin/events' && request.method === 'GET') return json({ events: snapshot.events }, 200, cors);
      if (url.pathname === '/api/admin/users/ban' && request.method === 'POST') { const body = adminBanSchema.parse(await request.json()); if (body.banned) await adminStorage.ban(admin.sub, body.userId); else await adminStorage.unban(admin.sub, body.userId); return json({ userId: body.userId, banned: body.banned }, 200, cors); }
      if (url.pathname === '/api/admin/notifications' && request.method === 'POST') { const body = adminNotificationSchema.parse(await request.json()); return json({ notification: await adminStorage.notify(admin.sub, body.title, body.message, Date.now()) }, 201, cors); }
      if (url.pathname === '/api/admin/events' && request.method === 'POST') { const body = adminEventSchema.parse(await request.json()); return json({ event: await adminStorage.createEvent(admin.sub, body.title, body.startsAt, body.endsAt, body.multiplier) }, 201, cors); }
      return json({ error: 'Not found' }, 404, cors);
    }
    const playerAuthorization = request.headers.get('authorization');
    if (playerAuthorization?.startsWith('Bearer ')) {
      let player;
      try { player = await verifyJwt(playerAuthorization.slice(7), env.JWT_SECRET); }
      catch { return json({ error: 'Unauthorized' }, 401, cors); }
      if (await adminStorage.isBanned(player.sub)) return json({ error: 'Account suspended' }, 403, cors);
      if (!(url.pathname === '/api/leaderboard/live' && request.headers.get('upgrade')?.toLowerCase() === 'websocket')) {
        const failure = await validateSignedRequest(request, player, env.JWT_SECRET, replayProtection);
        if (failure) { await antiCheatMonitor.flag(player.sub, failure, { path: url.pathname }); return json({ error: 'Request security check failed', reason: failure }, failure === 'replayed_request' ? 409 : 401, cors); }
      }
    }
    if (url.pathname === '/api/leaderboard/live' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (!env.LEADERBOARD_WEBSOCKET || !env.LEADERBOARD_PUBSUB) return json({ error: 'Realtime unavailable' }, 503, cors);
      return env.LEADERBOARD_WEBSOCKET.upgrade(request, new LeaderboardGateway(socialStorage.leaderboardRepository(), env.LEADERBOARD_PUBSUB, env.JWT_SECRET));
    }
    if (url.pathname === '/api/auth/telegram' && request.method === 'POST') {
      const body = authRequestSchema.parse(await request.json());
      const maximumAge = Number(env.AUTH_MAX_AGE_SECONDS ?? '300');
      let user;
      try { user = await validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN, maximumAge); }
      catch (error) { env.AUTH_LOG?.(error instanceof Error ? error.message : 'Telegram authentication failed'); return json({ error: 'Unauthorized' }, 401, cors); }
      const nowSeconds = Math.floor(Date.now() / 1_000);
      const token = await issueJwt(user, env.JWT_SECRET, 900, nowSeconds);
      const sessionKey = await deriveSessionKey({ sub: user.id, iat: nowSeconds }, env.JWT_SECRET);
      return json({ token, sessionKey, user }, 200, cors);
    }
    if (url.pathname === '/api/session' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors);
      const claims = await verifyJwt(authorization.slice(7), env.JWT_SECRET);
      if (!await playerRateLimiter.consume(`user:${claims.sub}`)) return json({ error: 'Too many requests' }, 429, cors);
      return json({ user: claims.user }, 200, cors);
    }
    if (url.pathname === '/api/game/state' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const player = await authenticatedPlayer(request, env);
      if (!player) return json({ error: 'Unauthorized' }, 401, cors);
      const userId = player.sub;
      if (!await playerRateLimiter.consume(`user:${userId}`)) return json({ error: 'Too many requests' }, 429, cors);
      const current = await gameStorage.stateFor(userId, Date.now());
      const result = applyOfflineProfit(current, Date.now(), await loadEconomyConfig(env));
      gameStorage.saveHot(result.state);
      await socialStorage.recordScore(userId, playerName(player), result.state.coins);
      return json({ state: result.state, offlineProfit: result.offlineProfit }, 200, cors);
    }
    if (url.pathname === '/api/economy/config' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ economy: await loadEconomyConfig(env) }, 200, cors);
    }
    if (url.pathname === '/api/game/taps' && request.method === 'POST') {
      const player = await authenticatedPlayer(request, env);
      if (!player) return json({ error: 'Unauthorized' }, 401, cors);
      const userId = player.sub;
      if (!await playerRateLimiter.consume(`user:${userId}`)) return json({ error: 'Too many requests' }, 429, cors);
      const batch = tapBatchSchema.parse(await request.json());
      const now = Date.now();
      const current = await gameStorage.stateFor(userId, now);
      const result = applyTapBatch(current, batch, now);
      if (!await gameStorage.claimBatch(userId, batch.batchId, now)) return json({ state: current, acceptedTaps: 0, duplicate: true }, 200, cors);
      gameStorage.saveHot(result.state);
      await gameStorage.queue.enqueue({ userId, batch, acceptedTaps: result.acceptedTaps, receivedAt: now });
      if (result.flagged) { await antiCheatMonitor.flag(userId, 'implausible_tap_rate', { taps: batch.taps }); return json({ error: 'Implausible tap rate', flagged: true, state: result.state }, 422, cors); }
      await socialStorage.recordScore(userId, playerName(player), result.state.coins);
      return json({ state: result.state, acceptedTaps: result.acceptedTaps, duplicate: false }, 200, cors);
    }
    if (url.pathname === '/api/store/catalog' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      const state = await gameStorage.stateFor(userId, Date.now());
      return json({ items: catalogFor(state, await loadEconomyConfig(env), await commerceStorage.inventory(userId)), coins: state.coins }, 200, cors);
    }
    if (url.pathname === '/api/store/purchase' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      const body = purchaseSchema.parse(await request.json());
      const result = await commerceStorage.purchase(userId, body.itemId, body.idempotencyKey, gameStorage, await loadEconomyConfig(env), Date.now());
      return json(result, 200, cors);
    }
    if (url.pathname === '/api/inventory' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ items: await commerceStorage.inventory(userId), purchases: await commerceStorage.purchaseHistory(userId), equippedSkin: await commerceStorage.equippedSkin(userId) }, 200, cors);
    }
    if (url.pathname === '/api/inventory/activate' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      const body = inventoryActivationSchema.parse(await request.json());
      return json(await commerceStorage.activate(userId, body.itemId, gameStorage, Date.now()), 200, cors);
    }
    if (url.pathname === '/api/inventory/skin' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      const body = skinSelectionSchema.parse(await request.json());
      return json({ equippedSkin: await commerceStorage.selectSkin(userId, body.skinId, Date.now()) }, 200, cors);
    }
    if (url.pathname === '/api/wallet/transactions' && request.method === 'GET') {
      emptyQuerySchema.parse(Object.fromEntries(url.searchParams));
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ transactions: await commerceStorage.paymentHistory(userId) }, 200, cors);
    }
    if (url.pathname === '/api/wallet/payments/intents' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      if (!env.REDIS || !env.TON_TREASURY_ADDRESS || !env.TON_PAYMENT_AMOUNT_NANO || !env.TON_PAYMENT_CREDIT_MTX) return json({ error: 'TON payments unavailable' }, 503, cors);
      const body = paymentIntentSchema.parse(await request.json());
      const transactionId = `ton_${crypto.randomUUID().replace(/-/g, '')}`;
      const intent = { userId, sourceAddress: body.sourceAddress, amountNano: env.TON_PAYMENT_AMOUNT_NANO, creditedCoins: env.TON_PAYMENT_CREDIT_MTX, createdAt: Date.now() };
      const saved = await env.REDIS.command<string | null>(['SET', `mtx:payment-intent:${transactionId}`, JSON.stringify(intent), 'NX', 'EX', '900']);
      if (saved !== 'OK') return json({ error: 'Payment intent unavailable' }, 503, cors);
      return json({ transactionId, recipient: env.TON_TREASURY_ADDRESS, amountNano: env.TON_PAYMENT_AMOUNT_NANO, creditedCoins: env.TON_PAYMENT_CREDIT_MTX, expiresAt: intent.createdAt + 900_000 }, 201, cors);
    }
    if (url.pathname === '/api/wallet/payments/confirm' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      if (!env.PAYMENT_VERIFIER || !env.REDIS) return json({ error: 'Payment provider unavailable' }, 503, cors);
      const body = paymentConfirmationSchema.parse(await request.json());
      if (body.provider !== 'ton' || body.asset !== 'TON') return json({ error: 'Payment asset unavailable' }, 400, cors);
      const previous = await commerceStorage.payment(body.transactionId);
      if (previous) return previous.userId === userId ? json({ transaction: previous, duplicate: true }, 200, cors) : json({ error: 'Transaction already used' }, 409, cors);
      const serializedIntent = await env.REDIS.command<string | null>(['GET', `mtx:payment-intent:${body.transactionId}`]);
      if (!serializedIntent) return json({ error: 'Payment intent expired' }, 410, cors);
      const intent = JSON.parse(serializedIntent) as { userId: string; sourceAddress: string; amountNano: number; creditedCoins: number; createdAt: number };
      if (intent.userId !== userId || body.amount !== intent.amountNano / 1_000_000_000) return json({ error: 'Payment intent mismatch' }, 409, cors);
      const verification = await env.PAYMENT_VERIFIER.verify({ provider: 'ton', transactionId: body.transactionId, amount: body.amount, asset: 'TON', userId, sourceAddress: intent.sourceAddress, createdAt: intent.createdAt });
      if (verification.status === 'pending') return json({ status: 'pending' }, 202, cors);
      const outcome = await commerceStorage.recordPayment({ ...body, userId, creditedCoins: verification.verified && verification.status === 'confirmed' ? Math.max(0, Math.floor(verification.creditedCoins)) : 0, status: verification.verified ? verification.status : 'failed', createdAt: Date.now() }, gameStorage, Date.now());
      await env.REDIS.command(['DEL', `mtx:payment-intent:${body.transactionId}`]);
      return json({ transaction: outcome.record, duplicate: outcome.duplicate }, 200, cors);
    }
    if (url.pathname === '/api/missions' && request.method === 'GET') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ missions: await socialStorage.missions(userId, await gameStorage.stateFor(userId, Date.now()), Date.now()) }, 200, cors);
    }
    if (url.pathname === '/api/missions/claim' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors);
      const body = missionClaimSchema.parse(await request.json()); return json(await socialStorage.claimMission(userId, body.missionId, gameStorage, Date.now()), 200, cors);
    }
    if (url.pathname === '/api/daily' && request.method === 'GET') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); return json(await socialStorage.dailyStatus(userId, Date.now()), 200, cors);
    }
    if (url.pathname === '/api/daily/claim' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); return json(await socialStorage.claimDaily(userId, gameStorage, Date.now()), 200, cors);
    }
    if (url.pathname === '/api/daily/challenges' && request.method === 'GET') { const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); return json(await socialStorage.challenges(userId, Date.now()), 200, cors); }
    if (url.pathname === '/api/daily/challenges/claim' && request.method === 'POST') { const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); const body = challengeClaimSchema.parse(await request.json()); return json(await socialStorage.claimChallenge(userId, body.type, body.answer, gameStorage, Date.now()), 200, cors); }
    if (url.pathname === '/api/referral' && request.method === 'GET') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); return json(await socialStorage.referralStatus(userId), 200, cors);
    }
    if (url.pathname === '/api/referral/accept' && request.method === 'POST') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); const body = referralAcceptSchema.parse(await request.json()); await socialStorage.acceptReferral(userId, body.code, body.deviceHash, gameStorage, Date.now()); return json({ accepted: true }, 200, cors);
    }
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      const player = await authenticatedPlayer(request, env); if (!player) return json({ error: 'Unauthorized' }, 401, cors); const state = await gameStorage.stateFor(player.sub, Date.now()); await socialStorage.recordScore(player.sub, playerName(player), state.coins); return json({ entries: await socialStorage.leaders() }, 200, cors);
    }
    if (url.pathname === '/api/profile' && request.method === 'GET') {
      const userId = await authenticatedUserId(request, env); if (!userId) return json({ error: 'Unauthorized' }, 401, cors); const state = await gameStorage.stateFor(userId, Date.now()); return json({ state, inventory: await commerceStorage.inventory(userId), referral: await socialStorage.referralStatus(userId), payments: await commerceStorage.paymentHistory(userId) }, 200, cors);
    }
    return json({ error: 'Not found' }, 404, cors);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: 'Invalid request' }, 400, cors);
    if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') return json({ error: 'Insufficient coins' }, 402, cors);
    if (error instanceof Error && (error.message === 'ITEM_UNAVAILABLE' || error.message === 'ITEM_NOT_OWNED' || error.message === 'BOOST_NOT_NEEDED' || error.message === 'PRICE_CHANGED' || error.message === 'STATE_VERSION_CONFLICT' || error.message === 'IDEMPOTENCY_KEY_REUSED')) return json({ error: error.message === 'BOOST_NOT_NEEDED' ? 'Energy is already full' : 'Conflict' }, 409, cors);
    if (error instanceof Error && (error.message.startsWith('MISSION_') || error.message.startsWith('DAILY_') || error.message.startsWith('REFERRAL_') || error.message.startsWith('CHALLENGE_'))) return json({ error: error.message }, 409, cors);
    return json({ error: 'Internal server error' }, 500, cors);
  }
}
