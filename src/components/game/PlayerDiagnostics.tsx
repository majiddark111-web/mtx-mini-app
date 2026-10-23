import { useEffect, useState } from 'react';
import { getApiSessionDiagnostic } from '../../api/httpClient';
import { gameDiagnostics, PLAYER_DIAGNOSTICS_VERSION } from '../../services/playerDiagnostics';
import { pendingTapCount } from '../../services/tapOutboxService';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../hooks/useI18n';

const pageOpenedAt = Date.now();

function DiagnosticReadout() {
  const [now, setNow] = useState(Date.now);
  const { text, number, date } = useI18n();
  const authStatus = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const tapPower = useAppStore((state) => state.tapPower);
  useEffect(() => {
    // Observing must not refresh credentials, flush taps or change authentication.
    const update = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const session = getApiSessionDiagnostic(now);
  const game = gameDiagnostics.snapshot(userId);
  const pending = (() => { try { return userId ? pendingTapCount(localStorage, userId) : null; } catch { return null; } })();
  const unknown = text('Not observed on this page', 'در این بار بازشدن ثبت نشده');
  const time = (value: number | null) => value === null ? unknown : date(value);
  const authLabels = {
    demo: text('Demo (not authenticated)', 'نمایشی (بدون ورود تأییدشده)'),
    loading: text('Signing in', 'در حال ورود'), authenticated: text('Authenticated', 'ورود تأییدشده'),
    error: text('Sign-in error', 'خطای ورود'), expired: text('Expired', 'منقضی‌شده'),
  };
  const sessionLabel = session.status === 'missing' ? text('No credential in memory', 'اعتبار ورود در حافظه وجود ندارد') : session.status === 'expired' ? text('Expired', 'منقضی‌شده') : text('Valid by device clock', 'معتبر طبق ساعت دستگاه');
  const remaining = session.remainingSeconds === null ? '—' : `${Math.floor(session.remainingSeconds / 60)}:${String(session.remainingSeconds % 60).padStart(2, '0')}`;
  return <div className="player-diagnostics-body">
    <dl>
      <dt>{text('Version', 'نسخه')}</dt><dd dir="ltr">{PLAYER_DIAGNOSTICS_VERSION}</dd>
      <dt>{text('Sign-in status', 'وضعیت ورود')}</dt><dd>{authLabels[authStatus]}</dd>
      <dt>{text('Credential status', 'وضعیت اعتبار')}</dt><dd>{sessionLabel}</dd>
      <dt>{text('Time remaining (min:sec)', 'زمان باقی‌مانده (دقیقه:ثانیه)')}</dt><dd dir="ltr">{remaining}</dd>
      <dt>{text('Expires at (device clock)', 'پایان اعتبار (ساعت دستگاه)')}</dt><dd>{time(session.expiresAt)}</dd>
      <dt>{text('Device time', 'زمان دستگاه')}</dt><dd>{date(now)}</dd>
      <dt>{text('Page opened', 'زمان بازشدن صفحه')}</dt><dd>{date(pageOpenedAt)}</dd>
      <dt>{text('Browser network indicator', 'نشانگر شبکهٔ مرورگر')}</dt><dd>{navigator.onLine ? text('Online (not proof of server access)', 'متصل (تضمین دسترسی به سرور نیست)') : text('Offline', 'قطع')}</dd>
      <dt>{text('Pending taps', 'تپ‌های منتظر ارسال')}</dt><dd>{pending === null ? '—' : number(pending)}</dd>
      <dt>{text('Displayed power per tap', 'قدرت هر تپ در برنامه')}</dt><dd>{number(tapPower)}</dd>
      <dt>{text('Last local tap attempt', 'آخرین تلاش برای تپ روی دستگاه')}</dt><dd>{time(game.lastLocalTapAt)}</dd>
      <dt>{text('Local tap result (not server confirmation)', 'نتیجهٔ محلی تپ (نه تأیید سرور)')}</dt><dd>{game.lastLocalTapAccepted === null ? unknown : game.lastLocalTapAccepted ? text('Allowed locally', 'مجاز روی دستگاه') : text('Blocked locally', 'مسدود روی دستگاه')}</dd>
      <dt>{text('Sign-in status at that tap', 'وضعیت ورود هنگام همان تپ')}</dt><dd>{game.lastLocalTapAuth === null ? unknown : authLabels[game.lastLocalTapAuth]}</dd>
      <dt>{text('Credential at that tap', 'اعتبار هنگام همان تپ')}</dt><dd>{game.lastLocalTapCredential === null ? unknown : game.lastLocalTapCredential === 'valid' ? text('Valid by device clock', 'معتبر طبق ساعت دستگاه') : game.lastLocalTapCredential === 'expired' ? text('Expired', 'منقضی‌شده') : text('No credential in memory', 'اعتبار ورود در حافظه وجود ندارد')}</dd>
      <dt>{text('Last server game response', 'آخرین پاسخ وضعیت بازی از سرور')}</dt><dd>{time(game.lastResponseAt)}</dd>
      <dt>{text('Last accepted tap batch', 'آخرین تأیید بستهٔ تپ')}</dt><dd>{time(game.lastAcceptedTapAt)}</dd>
      <dt>{text('Last rejected tap batch', 'آخرین رد بستهٔ تپ')}</dt><dd>{time(game.lastRejectedTapAt)}</dd>
      <dt>{text('Last server balance (MTX)', 'آخرین موجودی سرور (MTX)')}</dt><dd>{game.serverCoins === null ? '—' : number(game.serverCoins)}</dd>
      <dt>{text('Server tap power / upgrade level', 'قدرت تپ سرور / سطح ارتقا')}</dt><dd>{game.serverTapPower === null ? '—' : `${number(game.serverTapPower)} / ${number(game.serverTapLevel!)}`}</dd>
    </dl>
    <p>{text('Read-only. No tokens or keys are shown or sent. Server values are the last observed response, not a live balance. Reopening resets these observations; pending taps are not deleted.', 'فقط مشاهده: هیچ توکن یا کلیدی نمایش یا ارسال نمی‌شود. مقادیر سرور مربوط به آخرین پاسخ دریافتی‌اند، نه موجودی لحظه‌ای. با بازکردن مجدد، این مشاهدات از نو شروع می‌شوند؛ تپ‌های ذخیره‌شده پاک نمی‌شوند.')}</p>
  </div>;
}

export function PlayerDiagnostics() {
  const [open, setOpen] = useState(false);
  const { text } = useI18n();
  return <details className="player-diagnostics" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{text('Session diagnostics', 'تشخیص وضعیت ورود')} · <span dir="ltr">{PLAYER_DIAGNOSTICS_VERSION}</span></summary>
    {open && <DiagnosticReadout />}
  </details>;
}
