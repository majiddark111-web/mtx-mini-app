import { httpClient, getApiSessionSubject } from '../api/httpClient';
import { reconciledTapState } from './gameService';
import { gameDiagnostics } from './playerDiagnostics';

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
  const account = getApiSessionSubject();
  const result = (await httpClient.get<{ state: ServerGameState; offlineProfit: number }>('/api/game/state')).data;
  gameDiagnostics.record(account, result.state, 'read');
  return result;
}

export async function syncTapBatch(taps: number, durationMs: number, batchId: string): Promise<ServerGameState> {
  const account = getApiSessionSubject();
  const response = await httpClient.post<{ state: ServerGameState; flagged?: boolean }>('/api/game/taps', { taps, durationMs, batchId }, {
    validateStatus: (status) => (status >= 200 && status < 300) || status === 422,
  });
  // A confirmed rejection is terminal: reconcile with the server and remove
  // this batch from the outbox. Transport/server failures still remain queued.
  const state = reconciledTapState(response.status, response.data);
  gameDiagnostics.record(account, state, response.status === 422 ? 'tap-rejected' : 'tap-accepted');
  return state;
}
