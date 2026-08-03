import { httpClient } from '../api/httpClient';

export interface ServerGameState {
  coins: number;
  energy: number;
  maximumEnergy: number;
  profitPerTap: number;
  profitPerHour: number;
  version: number;
}

export async function fetchGameState(): Promise<{ state: ServerGameState; offlineProfit: number }> {
  return (await httpClient.get<{ state: ServerGameState; offlineProfit: number }>('/api/game/state')).data;
}

export async function syncTapBatch(taps: number, durationMs: number, batchId: string): Promise<ServerGameState> {
  return (await httpClient.post<{ state: ServerGameState }>('/api/game/taps', { taps, durationMs, batchId })).data.state;
}

