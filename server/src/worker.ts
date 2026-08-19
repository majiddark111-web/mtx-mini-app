import { handleRequestWithStorage } from './app.ts';
import { flushTapEvents, productionGameStorage, RedisLeaderboardRepository } from './productionStorage.ts';
import type { GameStorage } from './gameStorage.ts';
import type { Env } from './types.ts';
import { SocialStorage } from './social.ts';
import { PostgresSocialPersistence } from './socialPersistence.ts';
import { AntiCheatMonitor, RedisReplayProtection } from './requestSecurity.ts';
import { CommerceStorage } from './commerce.ts';
import { PostgresCommercePersistence } from './commercePersistence.ts';
import { AdminStorage } from './admin.ts';
import { PostgresAdminPersistence } from './adminPersistence.ts';
import { RedisRateLimiter } from './rateLimiter.ts';
import { PostgresAnomalyPersistence } from './antiCheatPersistence.ts';

let storage: GameStorage | undefined;
let requestsSinceTapFlush = 0;
let social: SocialStorage | undefined;
let commerce: CommerceStorage | undefined;
let admin: AdminStorage | undefined;
let ipRateLimiter: RedisRateLimiter | undefined;
let playerRateLimiter: RedisRateLimiter | undefined;
let antiCheatMonitor: AntiCheatMonitor | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.REDIS || !env.POSTGRES) return new Response(JSON.stringify({ error: 'Persistent infrastructure unavailable' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
    storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
    social ??= new SocialStorage(new RedisLeaderboardRepository(env.REDIS), new PostgresSocialPersistence(env.POSTGRES));
    commerce ??= new CommerceStorage(new PostgresCommercePersistence(env.POSTGRES));
    admin ??= new AdminStorage(new PostgresAdminPersistence(env.POSTGRES));
    ipRateLimiter ??= new RedisRateLimiter(env.REDIS, 60, 60_000, 'mtx:rate');
    playerRateLimiter ??= new RedisRateLimiter(env.REDIS, 120, 60_000, 'mtx:rate');
    antiCheatMonitor ??= new AntiCheatMonitor(new PostgresAnomalyPersistence(env.POSTGRES));
    const response = await handleRequestWithStorage(request, env, storage, commerce, social, admin, new RedisReplayProtection(env.REDIS), antiCheatMonitor, ipRateLimiter, playerRateLimiter);
    await storage.flushDirty();
    requestsSinceTapFlush += 1;
    if (requestsSinceTapFlush >= 100) { requestsSinceTapFlush = 0; await flushTapEvents(storage.queue, env.POSTGRES); }
    return response;
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (!env.REDIS || !env.POSTGRES) throw new Error('Persistent infrastructure unavailable');
    storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
    await storage.flushDirty();
    await flushTapEvents(storage.queue, env.POSTGRES);
  },
};
