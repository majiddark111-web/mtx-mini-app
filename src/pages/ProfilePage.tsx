import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { fetchProfile, type Achievement, type ProfileData } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';

const achievementText: Record<string, { faTitle: string; faDescription: string; arTitle: string; arDescription: string }> = {
  'tap-rookie': { faTitle: 'تازه‌کار تپ', faDescription: 'انجام ۱۰۰ تپ تأییدشده', arTitle: 'مبتدئ النقر', arDescription: 'نفّذ 100 نقرة مؤكدة' },
  'tap-master': { faTitle: 'استاد تپ', faDescription: 'انجام ۵٬۰۰۰ تپ تأییدشده', arTitle: 'محترف النقر', arDescription: 'نفّذ 5,000 نقرة مؤكدة' },
  'rising-star': { faTitle: 'ستاره نوظهور', faDescription: 'رسیدن به سطح ۵', arTitle: 'نجم صاعد', arDescription: 'بلوغ المستوى 5' },
  'power-builder': { faTitle: 'سازنده قدرت', faDescription: 'خرید ۵ سطح ارتقا', arTitle: 'صانع القوة', arDescription: 'اشترِ 5 مستويات ترقية' },
  collector: { faTitle: 'کلکسیونر', faDescription: 'انجام ۳ خرید از فروشگاه', arTitle: 'جامع العناصر', arDescription: 'أكمل 3 عمليات شراء من المتجر' },
  connector: { faTitle: 'رابط دوستان', faDescription: 'دعوت ۳ دوست', arTitle: 'صانع الروابط', arDescription: 'ادعُ 3 أصدقاء' },
};

export function ProfilePage() {
  const auth = useAppStore((state) => state.authStatus);
  const user = useAppStore((state) => state.user);
  const { fa, ar, text, number } = useI18n();
  const [profile, setProfile] = useState<ProfileData>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (auth !== 'authenticated') return;
    setFailed(false); void fetchProfile().then(setProfile).catch(() => setFailed(true));
  }, [auth]);
  const translated = (badge: Achievement) => {
    const local = achievementText[badge.id];
    if (fa && local) return { title: local.faTitle, description: local.faDescription };
    if (ar && local) return { title: local.arTitle, description: local.arDescription };
    return { title: badge.title, description: badge.description };
  };
  const unlocked = profile?.achievements.filter((badge) => badge.unlocked).length ?? 0;

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <section className="profile-card">
      {user.avatar && <img src={user.avatar} alt="" />}
      <h1>@{user.username}</h1>
      <span className="phase-badge">{profile?.state.rank ?? 'Bronze'} · {text('Level', 'سطح')} {number(profile?.state.level ?? 1)}</span>
      <div className="profile-stats"><span>{number(profile?.state.coins ?? 0)}<small>MTX</small></span><span>{number(profile?.state.xp ?? 0)}<small>XP</small></span><span>{number(profile?.inventory.length ?? 0)}<small>{text('Items', 'دارایی‌ها')}</small></span><span>{number(profile?.referral.invited ?? 0)}<small>{text('Referrals', 'دعوت‌ها')}</small></span></div>
      <p>{text('Profit per tap', 'درآمد هر تپ')}: {number(profile?.state.profitPerTap ?? 1)}</p>
      <p>{text('Profit per hour', 'درآمد ساعتی')}: {number(profile?.state.profitPerHour ?? 0)}</p>
    </section>
    <section className="achievement-section">
      <header><div><h2>{text('Achievements', 'دستاوردها')}</h2><p>{text('Badges earned through real game progress', 'نشان‌هایی که با پیشرفت واقعی بازی به‌دست می‌آیند')}</p></div><strong>{number(unlocked)} / {number(profile?.achievements.length ?? 6)}</strong></header>
      {failed ? <div className="empty-state">{text('Achievements could not load.', 'دستاوردها بارگذاری نشدند.')}</div> : !profile ? <div className="empty-state">{text('Loading achievements…', 'در حال بارگذاری دستاوردها…')}</div> : <div className="achievement-grid">{profile.achievements.map((badge) => {
        const copy = translated(badge); const percent = Math.min(100, badge.progress / badge.target * 100);
        return <article className={`achievement-card ${badge.unlocked ? 'unlocked' : 'locked'}`} key={badge.id}><div className="achievement-icon">{badge.unlocked ? badge.icon : '🔒'}</div><div><h3>{copy.title}</h3><p>{copy.description}</p><div className="achievement-progress"><i style={{ width: `${percent}%` }} /></div><small>{badge.unlocked ? text('Unlocked', 'باز شده') : `${number(badge.progress)} / ${number(badge.target)}`}</small></div></article>;
      })}</div>}
    </section>
  </main>;
}
