import { handleRequest, handleRequestWithStorage } from './app.ts';
import { productionGameStorage, RedisLeaderboardRepository } from './productionStorage.ts';
import type { GameStorage } from './gameStorage.ts';
import type { Env } from './types.ts';
import { SocialStorage } from './social.ts';

let storage: GameStorage | undefined;
let requestsSinceFlush = 0;
let social: SocialStorage | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.REDIS && env.POSTGRES) {
      storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
      social ??= new SocialStorage(new RedisLeaderboardRepository(env.REDIS));
      const response = await handleRequestWithStorage(request, env, storage, undefined, social);
      requestsSinceFlush += 1;
      if (requestsSinceFlush >= 100) { requestsSinceFlush = 0; await storage.flushDirty(); }
      return response;
    }
    return handleRequest(request, env);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (!env.REDIS || !env.POSTGRES) return;
    storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
    await storage.flushDirty();
  },
};
