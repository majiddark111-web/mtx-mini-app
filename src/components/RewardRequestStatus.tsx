import { useI18n } from '../hooks/useI18n';
import type { RewardRequestError } from '../hooks/useRewardRequest';

export function RewardRequestStatus({ authenticated, loading, error, retry }: {
  authenticated: boolean; loading: boolean; error?: RewardRequestError; retry: () => void;
}) {
  const { text } = useI18n();
  if (!authenticated) return <p role="status">{text('Reopen MTX in Telegram to sign in before claiming rewards.', 'برای دریافت پاداش، MTX را در تلگرام ببندید و دوباره باز کنید تا وارد شوید.')}</p>;
  if (loading) return <p role="status">{text('Loading reward status…', 'در حال دریافت وضعیت پاداش…')}</p>;
  if (!error) return null;
  const message = error === 'incorrect'
    ? text('The answer is incorrect. Check it and try again.', 'پاسخ درست نیست؛ آن را بررسی و دوباره امتحان کنید.')
    : error === 'load'
      ? text('Reward status could not load. Check your connection and refresh status.', 'وضعیت پاداش دریافت نشد. اتصال اینترنت را بررسی و وضعیت را تازه‌سازی کنید.')
      : error === 'refresh'
        ? text('Reward accepted, but status could not refresh. Refresh status before claiming again.', 'پاداش پذیرفته شد، اما وضعیت تازه نشد. پیش از دریافت دوباره، وضعیت را تازه‌سازی کنید.')
        : text('Could not confirm the reward. Check your connection and refresh status before trying again.', 'دریافت پاداش تأیید نشد. اتصال اینترنت را بررسی و پیش از تلاش دوباره، وضعیت را تازه‌سازی کنید.');
  return <div className="challenge-feedback error"><p role="alert">{message}</p>{error !== 'incorrect' && <button className="button primary" onClick={retry}>{text('Refresh reward status', 'تازه‌سازی وضعیت پاداش')}</button>}</div>;
}
