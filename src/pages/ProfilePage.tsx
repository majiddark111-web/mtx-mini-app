import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { useRewardRequest } from '../hooks/useRewardRequest';
import { GameIcon } from '../components/navigation/GameIcon';
import { fetchProfile, type Achievement } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';
import './profile.css';

const achievementText: Record<string, { faTitle: string; faDescription: string; arTitle: string; arDescription: string }> = {
  'tap-rookie': { faTitle: 'تازه‌کار تپ', faDescription: 'انجام ۱۰۰ تپ تأییدشده', arTitle: 'مبتدئ النقر', arDescription: 'نفّذ 100 نقرة مؤكدة' },
  'tap-master': { faTitle: 'استاد تپ', faDescription: 'انجام ۵٬۰۰۰ تپ تأییدشده', arTitle: 'محترف النقر', arDescription: 'نفّذ 5,000 نقرة مؤكدة' },
  'rising-star': { faTitle: 'ستاره نوظهور', faDescription: 'رسیدن به سطح ۵', arTitle: 'نجم صاعد', arDescription: 'بلوغ المستوى 5' },
  'power-builder': { faTitle: 'سازنده قدرت', faDescription: 'خرید ۵ سطح ارتقا', arTitle: 'صانع القوة', arDescription: 'اشترِ 5 مستويات ترقية' },
  collector: { faTitle: 'کلکسیونر', faDescription: 'انجام ۳ خرید از فروشگاه', arTitle: 'جامع العناصر', arDescription: 'أكمل 3 عمليات شراء من المتجر' },
  connector: { faTitle: 'رابط دوستان', faDescription: 'دعوت ۳ دوست', arTitle: 'صانع الروابط', arDescription: 'ادعُ 3 أصدقاء' },
};

export function ProfilePage() {
  const user = useAppStore((state) => state.user);
  const { fa, ar, text, number } = useI18n();
  const request = useRewardRequest(fetchProfile);
  const { auth, data: profile } = request;
  const translated = (badge: Achievement) => {
    const local = achievementText[badge.id];
    if (fa && local) return { title: local.faTitle, description: local.faDescription };
    if (ar && local) return { title: local.arTitle, description: local.arDescription };
    return { title: badge.title, description: badge.description };
  };
  const unlocked = profile?.achievements.filter((badge) => badge.unlocked).length ?? 0;

  return <main className="page robot-profile">
    <header className="profile-heading">
      <Link to="/" className="profile-brand">Tokx <span>Tap</span></Link>
      <Link className="profile-settings" to="/settings" aria-label={text('Settings', 'تنظیمات')}><GameIcon name="settings" /></Link>
    </header>
    <h1>{text('Profile', 'پروفایل')}</h1>
    {auth !== 'authenticated' ? <section className="profile-message" role="status">{auth === 'loading'
      ? text('Signing in…', 'در حال ورود…')
      : text('Reopen MTX in Telegram to view your profile.', 'برای مشاهده پروفایل، MTX را دوباره در تلگرام باز کنید.')}</section>
      : request.error ? <section className="profile-message" role="alert">
        <p>{text('Profile could not load. Please retry.', 'پروفایل بارگذاری نشد. دوباره تلاش کنید.')}</p>
        <button onClick={request.retry}>{text('Retry', 'تلاش دوباره')}</button>
      </section> : !profile ? <section className="profile-message" role="status" aria-busy="true">{text('Loading profile…', 'در حال بارگذاری پروفایل…')}</section>
      : <>
        <section className="profile-identity" aria-label={text('Profile', 'پروفایل')}>
          <div className="profile-avatar"><GameIcon name="profile" />{user.avatar && <img key={user.avatar} src={user.avatar} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}</div>
          <h2><bdi>@{user.username}</bdi></h2>
          <p className="profile-rank"><GameIcon name="trophy" />{profile.state.rank} · {text('Level', 'سطح')} {number(profile.state.level)}</p>
          <dl className="profile-metrics">
            <div><dt>MTX</dt><dd>{number(profile.state.coins)}</dd></div>
            <div><dt>XP</dt><dd>{number(profile.state.xp)}</dd></div>
            <div><dt>{text('Items', 'دارایی‌ها')}</dt><dd>{number(profile.inventory.length)}</dd></div>
            <div><dt>{text('Referrals', 'دعوت‌ها')}</dt><dd>{number(profile.referral.invited)}</dd></div>
          </dl>
          <div className="profile-income"><p>{text('Profit per tap', 'درآمد هر تپ')}<strong>{number(profile.state.profitPerTap)} MTX</strong></p><p>{text('Profit per hour', 'درآمد ساعتی')}<strong>{number(profile.state.profitPerHour)} MTX</strong></p></div>
        </section>
        <section className="profile-achievements">
          <header><div><h2>{text('Achievements', 'دستاوردها')}</h2><p>{text('Badges earned through real game progress', 'نشان‌هایی که با پیشرفت واقعی بازی به‌دست می‌آیند')}</p></div><strong><bdi dir="ltr">{number(unlocked)} / {number(profile.achievements.length)}</bdi></strong></header>
          {profile.achievements.length === 0 ? <p className="profile-message">{text('No achievements yet.', 'هنوز دستاوردی وجود ندارد.')}</p> : <div className="profile-badges">{profile.achievements.map((badge) => {
            const copy = translated(badge);
            const ratio = badge.target > 0 ? badge.progress / badge.target * 100 : 0;
            const percent = Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 0;
            return <article className={`profile-badge${badge.unlocked ? ' is-unlocked' : ''}`} key={badge.id}>
              <span className="profile-badge-icon" aria-hidden="true">{badge.unlocked ? badge.icon : '🔒'}</span>
              <div><h3>{copy.title}</h3><p>{copy.description}</p><div className="profile-progress" role="progressbar" aria-label={copy.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div><small>{badge.unlocked ? text('Unlocked', 'باز شده') : <bdi dir="ltr">{number(badge.progress)} / {number(badge.target)}</bdi>}</small></div>
            </article>;
          })}</div>}
        </section>
      </>}
  </main>;
}
