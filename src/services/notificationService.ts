import { getApiSessionSubject, httpClient } from '../api/httpClient';
import { parseNotifications } from './readModels';

export type NotificationKind = 'announcement' | 'upgrade' | 'purchase' | 'payment' | 'reward';
export interface PlayerNotification { id: string; kind: NotificationKind; title: string; message: string; createdAt: number; read: boolean; }
export interface NotificationResult { notifications: PlayerNotification[]; unreadCount: number; }

export const NOTIFICATIONS_CHANGED = 'mtx:notifications-read';
export async function fetchNotifications(): Promise<NotificationResult> {
  return parseNotifications((await httpClient.get<unknown>('/api/notifications')).data);
}
export async function markAllNotificationsRead(): Promise<void> {
  const userId = getApiSessionSubject();
  try {
    const response = await httpClient.post<{ ok?: boolean }>('/api/notifications/read-all', {});
    if (response.data?.ok !== true) throw new Error('Read status could not be confirmed');
  } finally {
    // Even a lost response can mean the write succeeded. Request a read, never assume zero.
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { userId } }));
  }
}
