import { httpClient } from '../api/httpClient';
import { parseHistory } from './readModels';
import type { PaymentRecord, PurchaseRecord } from './commerceService';

export interface RewardHistoryRecord { id: string; title: string; amount: number; createdAt: number; dateOnly?: string; }
export interface HistoryResult { purchases: PurchaseRecord[]; payments: PaymentRecord[]; rewards: RewardHistoryRecord[]; }

export async function fetchHistory(): Promise<HistoryResult> {
  return parseHistory((await httpClient.get<unknown>('/api/history')).data);
}
