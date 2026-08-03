import type { PostgresQueries, RedisCommands } from './productionStorage.ts';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  APP_ORIGIN: string;
  AUTH_MAX_AGE_SECONDS?: string;
  REDIS?: RedisCommands;
  POSTGRES?: PostgresQueries;
  ECONOMY_CONFIG?: { get(key: string): Promise<string | null> };
  PAYMENT_VERIFIER?: { verify(input: { provider: 'ton' | 'usdt'; transactionId: string; amount: number; asset: 'TON' | 'USDT'; userId: string }): Promise<{ verified: boolean; creditedCoins: number; status: 'confirmed' | 'failed' | 'refunded' }> };
}

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export interface SessionClaims {
  sub: string;
  user: AuthenticatedUser;
  iat: number;
  exp: number;
}
