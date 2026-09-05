import { httpClient } from '../api/httpClient';

export type NotificationKind = 'announcement' | 'upgrade' | 'purchase' | 'payment' | 'reward';
export interface PlayerNotification { id: string; kind: NotificationKind; title: string; message: string; createdAt: number; read: boolean; }
export interface NotificationResult { notifications: PlayerNotification[]; unreadCount: number; }

export async function fetchNotifications(): Promise<NotificationResult> { return (await httpClient.get<NotificationResult>('/api/notifications')).data; }
export async function markAllNotificationsRead(): Promise<void> { await httpClient.post('/api/notifications/read-all', {}); window.dispatchEvent(new Event('mtx:notifications-read')); }
