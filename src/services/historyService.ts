import { httpClient } from '../api/httpClient';
import type { PaymentRecord, PurchaseRecord } from './commerceService';

export interface RewardHistoryRecord { id: string; title: string; amount: number; createdAt: number; }
export interface HistoryResult { purchases: PurchaseRecord[]; payments: PaymentRecord[]; rewards: RewardHistoryRecord[]; }

export async function fetchHistory(): Promise<HistoryResult> {
  return (await httpClient.get<HistoryResult>('/api/history')).data;
}
