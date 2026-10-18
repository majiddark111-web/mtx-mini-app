import { useI18n } from '../../hooks/useI18n';
import { useAppStore } from '../../store/useAppStore';

export function PlayerSessionNotice() {
  const status = useAppStore((state) => state.authStatus);
  const { text } = useI18n();
  if (status !== 'expired') return null;
  return <aside className="player-session-notice" role="alert">
    <strong>{text('Your session has ended.', 'اعتبار ورود شما تمام شده است.')}</strong>
    <p>{text('Close the Mini App and open it again from the bot. Pending taps remain on this device; do not clear app or browser data.', 'مینی‌اپ را ببندید و دوباره از ربات باز کنید. تپ‌های ارسال‌نشده روی همین دستگاه نگه‌داری شده‌اند؛ داده‌های برنامه یا مرورگر را پاک نکنید.')}</p>
  </aside>;
}
