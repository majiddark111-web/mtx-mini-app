import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../hooks/useI18n';
import { fetchNotifications, NOTIFICATIONS_CHANGED } from '../../services/notificationService';
import { useAppStore } from '../../store/useAppStore';

export function NotificationBell() {
  const auth = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const { text, number } = useI18n();
  const [badge, setBadge] = useState<{ userId: string; unread?: number }>({ userId: '' });
  useEffect(() => {
    let active = true, inFlight = false, queued = false, revision = 0;
    const current = () => active && useAppStore.getState().authStatus === 'authenticated' && useAppStore.getState().user.id === userId;
    setBadge({ userId });
    if (auth !== 'authenticated' || !userId) return () => { active = false; };
    const load = async () => {
      if (!current()) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      const started = revision;
      try {
        const result = await fetchNotifications();
        if (current() && started === revision) setBadge({ userId, unread: result.unreadCount });
      } catch {
        if (current() && started === revision) setBadge({ userId });
      } finally {
        inFlight = false;
        if (queued && current()) { queued = false; void load(); }
      }
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId !== userId || !current()) return;
      revision++;
      setBadge({ userId });
      void load();
    };
    void load();
    const timer = window.setInterval(() => { if (!inFlight) void load(); }, 60_000);
    window.addEventListener(NOTIFICATIONS_CHANGED, changed);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener(NOTIFICATIONS_CHANGED, changed); };
  }, [auth, userId]);
  const unread = auth === 'authenticated' && badge.userId === userId ? badge.unread : undefined;
  return <Link className="notification-bell" to="/notifications" aria-label={text('Notifications', 'اعلان‌ها')}>🔔{unread !== undefined && unread > 0 && <b>{number(Math.min(99, unread))}{unread > 99 ? '+' : ''}</b>}</Link>;
}
