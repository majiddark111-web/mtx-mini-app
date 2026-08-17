import { handleRequest, handleRequestWithStorage } from './app.ts';
import { flushTapEvents, productionGameStorage, RedisLeaderboardRepository } from './productionStorage.ts';
import type { GameStorage } from './gameStorage.ts';
import type { Env } from './types.ts';
import { SocialStorage } from './social.ts';
import { PostgresSocialPersistence } from './socialPersistence.ts';
import { RedisReplayProtection } from './requestSecurity.ts';
import { CommerceStorage } from './commerce.ts';
import { PostgresCommercePersistence } from './commercePersistence.ts';
import { AdminStorage } from './admin.ts';
import { PostgresAdminPersistence } from './adminPersistence.ts';

let storage: GameStorage | undefined;
let requestsSinceFlush = 0;
let social: SocialStorage | undefined;
let commerce: CommerceStorage | undefined;
let admin: AdminStorage | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.REDIS && env.POSTGRES) {
      storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
      social ??= new SocialStorage(new RedisLeaderboardRepository(env.REDIS), new PostgresSocialPersistence(env.POSTGRES));
      commerce ??= new CommerceStorage(new PostgresCommercePersistence(env.POSTGRES));
      admin ??= new AdminStorage(new PostgresAdminPersistence(env.POSTGRES));
      const response = await handleRequestWithStorage(request, env, storage, commerce, social, admin, new RedisReplayProtection(env.REDIS));
      requestsSinceFlush += 1;
      if (requestsSinceFlush >= 100) { requestsSinceFlush = 0; await storage.flushDirty(); await flushTapEvents(storage.queue, env.POSTGRES); }
      return response;
    }
    return handleRequest(request, env);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (!env.REDIS || !env.POSTGRES) return;
    storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
    await storage.flushDirty();
    await flushTapEvents(storage.queue, env.POSTGRES);
  },
};
