import { httpClient } from '../api/httpClient';
import { reconciledTapState } from './gameService';

export interface ServerGameState {
  coins: number;
  energy: number;
  maximumEnergy: number;
  profitPerTap: number;
  profitPerHour: number;
  tapLevel: number;
  energyLevel: number;
  profitLevel: number;
  version: number;
}

export async function fetchGameState(): Promise<{ state: ServerGameState; offlineProfit: number }> {
  return (await httpClient.get<{ state: ServerGameState; offlineProfit: number }>('/api/game/state')).data;
}

export async function syncTapBatch(taps: number, durationMs: number, batchId: string): Promise<ServerGameState> {
  const response = await httpClient.post<{ state: ServerGameState; flagged?: boolean }>('/api/game/taps', { taps, durationMs, batchId }, {
    validateStatus: (status) => (status >= 200 && status < 300) || status === 422,
  });
  // A confirmed rejection is terminal: reconcile with the server and remove
  // this batch from the outbox. Transport/server failures still remain queued.
  return reconciledTapState(response.status, response.data);
}
