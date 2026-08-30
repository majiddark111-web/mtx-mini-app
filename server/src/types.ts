import type { PostgresQueries, RedisCommands } from './productionStorage.ts';
import type { LeaderboardGateway, LeaderboardPubSub } from './leaderboardGateway.ts';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  APP_ORIGIN: string;
  AUTH_MAX_AGE_SECONDS?: string;
  AUTH_LOG?: (message: string) => void;
  REDIS?: RedisCommands;
  POSTGRES?: PostgresQueries;
  ECONOMY_CONFIG?: { get(key: string): Promise<string | null> };
  PAYMENT_VERIFIER?: { verify(input: { provider: 'ton'; transactionId: string; amount: number; asset: 'TON'; userId: string; sourceAddress: string; createdAt: number }): Promise<{ verified: boolean; creditedCoins: number; status: 'pending' | 'confirmed' | 'failed' }> };
  TON_TREASURY_ADDRESS?: string;
  TON_PAYMENT_AMOUNT_NANO?: number;
  TON_PAYMENT_CREDIT_MTX?: number;
  LEADERBOARD_PUBSUB?: LeaderboardPubSub;
  LEADERBOARD_WEBSOCKET?: { upgrade(request: Request, gateway: LeaderboardGateway): Promise<Response> };
  ADMIN_JWT_SECRET?: string;
  ADMIN_AUTH?: { verify(input: { username: string; password: string; otp: string }): Promise<{ id: string } | null> };
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
