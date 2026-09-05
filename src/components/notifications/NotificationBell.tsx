import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../hooks/useI18n';
import { fetchNotifications } from '../../services/notificationService';
import { useAppStore } from '../../store/useAppStore';

export function NotificationBell() {
  const auth = useAppStore((state) => state.authStatus); const { text, number } = useI18n(); const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (auth !== 'authenticated') { setUnread(0); return; }
    let active = true; const load = () => void fetchNotifications().then((result) => { if (active) setUnread(result.unreadCount); }).catch(() => undefined);
    const cleared = () => setUnread(0); load(); const timer = window.setInterval(load, 60_000); window.addEventListener('mtx:notifications-read', cleared);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('mtx:notifications-read', cleared); };
  }, [auth]);
  return <Link className="notification-bell" to="/notifications" aria-label={text('Notifications', 'اعلان‌ها')}>🔔{unread > 0 && <b>{number(Math.min(99, unread))}{unread > 99 ? '+' : ''}</b>}</Link>;
}
