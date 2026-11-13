import { Link } from 'react-router-dom';
import { GameIcon, type GameIconName } from '../components/navigation/GameIcon';
import { useI18n } from '../hooks/useI18n';
import { useAppStore } from '../store/useAppStore';
import './home.css';

const shortcuts: { to: string; icon: GameIconName; en: string; fa: string }[] = [
  { to: '/referral', icon: 'friends', en: 'Invite Friends', fa: 'دعوت دوستان' },
  { to: '/daily-reward', icon: 'earn', en: 'Daily Reward', fa: 'جایزه روزانه' },
  { to: '/store', icon: 'store', en: 'Store', fa: 'فروشگاه' },
  { to: '/leaderboard', icon: 'trophy', en: 'Leaderboard', fa: 'رتبه‌بندی' },
  { to: '/history', icon: 'history', en: 'History', fa: 'تاریخچه' },
  { to: '/settings', icon: 'settings', en: 'Settings', fa: 'تنظیمات' },
];

export function HomePage() {
  const score = useAppStore((state) => state.score);
  const { text, number } = useI18n();
  return <main className="page robot-home">
    <header className="home-brand"><span dir="ltr">Tokx <span>Tap</span></span><span className="home-network">Testnet</span></header>
    <section className="hero home-hero">
      <picture className="home-robot" aria-hidden="true">
        <source srcSet="/mtx-robot-scene.webp" type="image/webp" />
        <img src="/mtx-robot-scene.png" width="1122" height="1402" alt="" decoding="async" draggable="false" />
      </picture>
      <div className="home-welcome">
        <span className="phase-badge">{text('Telegram Mini App', 'مینی‌اپ تلگرام')}</span>
        <h1>{text('Tap. Earn. Level up.', 'تپ کن، درآمد بگیر، ارتقا بده.')}</h1>
        <p>{text('Your current balance is', 'موجودی فعلی شما')}<strong className="home-balance"><bdi>{number(score)} MTX</bdi></strong></p>
        <Link className="button primary launch" to="/game"><GameIcon name="game" />{text('Play MTX', 'بازی MTX')}</Link>
      </div>
    </section>
    <nav className="home-shortcuts" aria-label={text('MTX features', 'امکانات MTX')}>
      {shortcuts.map((item) => <Link key={item.to} to={item.to}><GameIcon name={item.icon} /><strong>{text(item.en, item.fa)}</strong></Link>)}
    </nav>
  </main>;
}
