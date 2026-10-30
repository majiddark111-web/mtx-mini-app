import type { HistoryResult } from './historyService';
import type { Leader } from './socialService';
import type { NotificationResult } from './notificationService';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const label = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const unique = (values: Record<string, unknown>[], key: string) => new Set(values.map((value) => value[key])).size === values.length;

export function parseNotifications(value: unknown): NotificationResult {
  if (!record(value) || !Array.isArray(value.notifications) ||
      !value.notifications.every((item) => record(item) && label(item.id) &&
        typeof item.kind === 'string' && ['announcement', 'upgrade', 'purchase', 'payment', 'reward'].includes(item.kind) &&
        typeof item.title === 'string' && typeof item.message === 'string' && amount(item.createdAt) && typeof item.read === 'boolean') ||
      !unique(value.notifications, 'id') || !Number.isSafeInteger(value.unreadCount) ||
      value.unreadCount !== value.notifications.filter((item) => !item.read).length) throw new Error('Invalid notifications');
  return value as unknown as NotificationResult;
}

// Reject ambiguous rows rather than silently hiding duplicate records or inventing totals.
export function parseHistory(value: unknown): HistoryResult {
  if (!record(value)) throw new Error('Invalid history');
  const { purchases, payments, rewards } = value;
  if (!Array.isArray(purchases) || !Array.isArray(payments) || !Array.isArray(rewards) ||
      !purchases.every((item) => record(item) && label(item.id) && label(item.itemId) && amount(item.price) && amount(item.createdAt)) ||
      !payments.every((item) => record(item) && label(item.transactionId) && ['ton', 'usdt'].includes(String(item.provider)) &&
        ['TON', 'USDT'].includes(String(item.asset)) && ['pending', 'confirmed', 'failed', 'refunded'].includes(String(item.status)) &&
        amount(item.amount) && amount(item.creditedCoins) && amount(item.createdAt)) ||
      !rewards.every((item) => record(item) && label(item.id) && label(item.title) && amount(item.amount) && amount(item.createdAt)) ||
      !unique(purchases, 'id') || !unique(payments, 'transactionId') || !unique(rewards, 'id')) throw new Error('Invalid history');
  return value as unknown as HistoryResult;
}

export function parseLeaders(value: unknown): Leader[] {
  if (!Array.isArray(value) || !value.every((item) => record(item) && label(item.userId) &&
      typeof item.username === 'string' && amount(item.coins) && Number.isSafeInteger(item.rank) && Number(item.rank) > 0) ||
      !unique(value, 'userId') || !unique(value, 'rank')) throw new Error('Invalid leaderboard');
  return value as Leader[];
}
