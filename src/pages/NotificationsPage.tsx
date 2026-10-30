import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { fetchNotifications, markAllNotificationsRead, type NotificationKind, type NotificationResult, type PlayerNotification } from '../services/notificationService';
import { useRewardRequest } from '../hooks/useRewardRequest';

const icon: Record<NotificationKind, string> = { announcement: '📣', upgrade: '⬆️', purchase: '🛍️', payment: '💎', reward: '🎁' };
export function NotificationsPage() {
  const { text, date } = useI18n();
  const request = useRewardRequest(fetchNotifications);
  const { auth, loading, error } = request;
  const data: NotificationResult = request.data ?? { notifications: [], unreadCount: 0 };
  const translatedTitle = (item: PlayerNotification) => item.kind === 'upgrade' ? text('Upgrade activated', 'ارتقا فعال شد') : item.kind === 'purchase' ? text('Purchase completed', 'خرید تکمیل شد') : item.kind === 'payment' ? text('Payment update', 'به‌روزرسانی پرداخت') : item.kind === 'reward' ? text('Reward received', 'جایزه دریافت شد') : item.title;
  const markAll = () => request.run('read-all', markAllNotificationsRead);
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Notifications', 'اعلان‌ها')}</h1><p>{text('Game activity and official announcements', 'فعالیت بازی و اطلاعیه‌های رسمی')}</p></div>{data.unreadCount > 0 && <button className="button ghost" disabled={!request.ready} onClick={() => void markAll()}>{request.pending ? text('Saving…', 'ذخیره…') : text('Mark all read', 'خواندن همه')}</button>}</header>{auth !== 'authenticated' ? <section className="empty-state">{text('Open MTX inside Telegram to view notifications.', 'برای مشاهده اعلان‌ها، MTX را داخل تلگرام باز کنید.')}</section> : loading ? <section className="empty-state">{text('Loading notifications…', 'در حال بارگذاری اعلان‌ها…')}</section> : error ? <section className="empty-state" role="alert">{text('Notification status could not be confirmed. Refresh without marking again.', 'وضعیت اعلان‌ها تأیید نشد. بدون تکرار عملیات، وضعیت را تازه‌سازی کنید.')}<button className="button ghost" onClick={request.retry}>{text('Retry', 'تلاش دوباره')}</button></section> : data.notifications.length === 0 ? <section className="empty-state">{text('No notifications yet.', 'هنوز اعلانی وجود ندارد.')}</section> : <section className="notification-list">{data.notifications.map((item) => <article className={`notification-item${item.read ? '' : ' unread'}`} key={item.id}><span>{icon[item.kind]}</span><div><strong>{translatedTitle(item)}</strong><p>{item.message}</p><time>{date(item.createdAt)}</time></div>{!item.read && <i title={text('Unread', 'خوانده‌نشده')} />}</article>)}</section>}</main>;
}
