import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
const shortcuts = [
  { to: '/referral', icon: '👥', label: 'Invite Friends' },
  { to: '/daily-reward', icon: '🎁', label: 'Daily Reward' },
  { to: '/store', icon: '🛍️', label: 'Store' },
  { to: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
  { to: '/history', icon: '🕘', label: 'History' },
];
export function HomePage() { const score = useAppStore((state) => state.score); return <main className="page"><span className="brand">MTX</span><section className="hero"><span className="phase-badge">Telegram Mini App</span><h1>Tap. Earn. Level up.</h1><p>Your current balance is <strong>{score} MTX</strong>.</p><Link className="button primary launch" to="/game">Play MTX</Link></section><nav className="home-shortcuts" aria-label="MTX features">{shortcuts.map((item) => <Link key={item.to} to={item.to}><span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong></Link>)}</nav></main>; }
