import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { useRewardRequest } from '../hooks/useRewardRequest';
import { acceptReferral, fetchReferral } from '../services/socialService';
import { telegramStartAppLink } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';

async function fingerprint(): Promise<string> {
  const data = new TextEncoder().encode(navigator.userAgent + ':' + window.screen.width + 'x' + window.screen.height);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function ReferralPage() {
  const userId = useAppStore((state) => state.user.id);
  const request = useRewardRequest(fetchReferral);
  const { text, number } = useI18n();
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<'accepted' | 'copied' | 'copy-error'>();
  const [copying, setCopying] = useState(false);
  const copyScope = useRef({ active: false, busy: false });

  useEffect(() => {
    const scope = { active: true, busy: false };
    copyScope.current = scope;
    setCode(''); setFeedback(undefined); setCopying(false);
    return () => { scope.active = false; };
  }, [userId, request.auth]);

  const sameAccount = () => useAppStore.getState().authStatus === 'authenticated' &&
    useAppStore.getState().user.id === userId;
  const apply = async () => {
    const value = code.trim();
    if (!request.ready || !value) return;
    setFeedback(undefined);
    const accepted = await request.run('referral', async () => {
      const deviceHash = await fingerprint();
      // Fingerprinting is asynchronous: never submit under a different account.
      if (!sameAccount()) throw new Error('SESSION_CHANGED');
      await acceptReferral(value, deviceHash);
    });
    if (accepted) { setCode(''); setFeedback('accepted'); }
  };

  const copy = async () => {
    const scope = copyScope.current;
    if (!request.ready || !request.data?.code || !sameAccount() || !scope.active || scope.busy) return;
    scope.busy = true; setCopying(true); setFeedback(undefined);
    try {
      await navigator.clipboard.writeText(telegramStartAppLink(request.data.code));
      if (scope.active && sameAccount()) setFeedback('copied');
    } catch {
      if (scope.active && sameAccount()) setFeedback('copy-error');
    } finally {
      scope.busy = false;
      if (scope.active && sameAccount()) setCopying(false);
    }
  };

  const errorMessage = request.error === 'refresh'
    ? text('Referral accepted, but status could not refresh. Refresh status without submitting again.', 'دعوت پذیرفته شد، اما وضعیت تازه نشد. بدون ثبت دوباره، وضعیت را تازه‌سازی کنید.')
    : request.error === 'load'
      ? text('Referral service is temporarily unavailable.', 'سرویس دعوت موقتاً در دسترس نیست.')
      : text('Referral acceptance could not be confirmed. Check the code and refresh status before trying again.', 'پذیرش دعوت تأیید نشد. کد را بررسی کنید و پیش از تلاش دوباره، وضعیت را تازه‌سازی کنید.');

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <section className="referral-card">
      <h1>{text('Invite friends', 'دعوت دوستان')}</h1>
      <p>{text('Your code', 'کد شما')}</p>
      <strong dir="ltr" style={{ overflowWrap: 'anywhere' }}>{request.data?.code || '—'}</strong>
      {request.auth !== 'authenticated'
        ? <p role="status">{text('Reopen MTX in Telegram to use referrals.', 'برای استفاده از دعوت، MTX را در تلگرام ببندید و دوباره باز کنید.')}</p>
        : request.loading
          ? <p role="status">{text('Loading referral status…', 'در حال دریافت وضعیت دعوت…')}</p>
          : request.error && <div>
            <p role="alert">{errorMessage}</p>
            <button className="button ghost" onClick={request.retry}>{text('Refresh referral status', 'تازه‌سازی وضعیت دعوت')}</button>
          </div>}
      {request.auth === 'authenticated' && !request.error && feedback && <p role={feedback === 'copy-error' ? 'alert' : 'status'}>
        {feedback === 'accepted' ? text('Referral code accepted.', 'کد دعوت پذیرفته شد.')
          : feedback === 'copied' ? text('Invite link copied.', 'لینک دعوت کپی شد.')
            : text('Could not copy the link. Check clipboard permission and try again.', 'کپی لینک انجام نشد. مجوز کلیپ‌بورد را بررسی و دوباره تلاش کنید.')}
      </p>}
      <button className="button ghost" disabled={!request.ready || !request.data?.code || copying} onClick={() => void copy()}>
        {copying ? text('Copying…', 'در حال کپی…') : text('Copy invite link', 'کپی لینک دعوت')}
      </button>
      <div className="referral-stats">
        <span>{request.data ? number(request.data.invited) : '—'}<small>{text('Invited', 'دعوت‌شده')}</small></span>
        <span>{request.data ? number(request.data.earned) : '—'}<small>{text('MTX earned', 'MTX کسب‌شده')}</small></span>
      </div>
      <input aria-label={text('Referral code', 'کد دعوت')} placeholder={text('Referral code', 'کد دعوت')}
        disabled={!request.ready} value={code} onChange={(event) => setCode(event.target.value)} />
      <button className="button primary" disabled={!request.ready || !code.trim()} onClick={() => void apply()}>
        {request.pending ? text('Checking…', 'در حال بررسی…') : text('Apply code', 'ثبت کد')}
      </button>
      <small className="muted">{text('Self-referral and repeated device fingerprints are rejected.', 'دعوت خود و استفاده تکراری از یک دستگاه رد می‌شود.')}</small>
    </section>
  </main>;
}
