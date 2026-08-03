import { handleRequest, handleRequestWithStorage } from './app.ts';
import { productionGameStorage } from './productionStorage.ts';
import type { GameStorage } from './gameStorage.ts';
import type { Env } from './types.ts';

let storage: GameStorage | undefined;
let requestsSinceFlush = 0;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.REDIS && env.POSTGRES) {
      storage ??= productionGameStorage(env.REDIS, env.POSTGRES);
      const response = await handleRequestWithStorage(request, env, storage);
      requestsSinceFlush += 1;
      if (requestsSinceFlush >= 100) { requestsSinceFlush = 0; await storage.flushDirty(); }
      return response;
    }
    return handleRequest(request, env);
  },
};
