import { verifyJwt } from './jwt.ts';
import type { LeaderboardRepository } from './social.ts';

export interface GatewaySocket { send(data: string): void; close(code?: number, reason?: string): void; }
export interface LeaderboardPubSub { subscribe(channel: string, listener: () => void): Promise<() => void>; }

export class LeaderboardGateway {
  private readonly leaderboard: LeaderboardRepository;
  private readonly pubsub: LeaderboardPubSub;
  private readonly jwtSecret: string;
  constructor(leaderboard: LeaderboardRepository, pubsub: LeaderboardPubSub, jwtSecret: string) { this.leaderboard = leaderboard; this.pubsub = pubsub; this.jwtSecret = jwtSecret; }
  async authenticate(socket: GatewaySocket, message: string): Promise<() => void> {
    try {
      const value = JSON.parse(message) as { type?: string; token?: string };
      if (value.type !== 'auth' || typeof value.token !== 'string') throw new Error('Invalid auth message');
      await verifyJwt(value.token, this.jwtSecret);
      const publish = async () => socket.send(JSON.stringify({ type: 'leaderboard', entries: await this.leaderboard.leaders(100) }));
      await publish();
      return this.pubsub.subscribe('lumos:leaderboard:updates', () => { void publish(); });
    } catch { socket.close(4401, 'Unauthorized'); throw new Error('Unauthorized'); }
  }
}

