import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiAuthToken } from '../api/httpClient';
import { VirtualList } from '../components/common/VirtualList';
import { useI18n } from '../hooks/useI18n';
import { fetchLeaderboard, type Leader, type LeaderboardScope } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';

const scopes: { id: LeaderboardScope; icon: string; en: string; fa: string }[] = [
  { id: 'global', icon: '🌍', en: 'Global', fa: 'کلی' },
  { id: 'friends', icon: '👥', en: 'Friends', fa: 'دوستان' },
  { id: 'weekly', icon: '📅', en: 'Weekly', fa: 'هفتگی' },
  { id: 'monthly', icon: '🗓️', en: 'Monthly', fa: 'ماهانه' },
  { id: 'season', icon: '🏆', en: 'Season', fa: 'فصل' },
];

export function LeaderboardPage() {
  const auth = useAppStore((state) => state.authStatus);
  const currentUserId = useAppStore((state) => state.user.id);
  const { text, number } = useI18n();
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [entries, setEntries] = useState<Leader[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (auth !== 'authenticated') return;
    let active = true; let connected = false; let socket: WebSocket | undefined;
    const load = () => { setLoading(true); void fetchLeaderboard(scope).then((items) => { if (active) setEntries(items); }).finally(() => { if (active) setLoading(false); }); };
    load();
    const url = import.meta.env.VITE_LEADERBOARD_WS as string | undefined;
    if (scope === 'global' && url) {
      socket = new WebSocket(url);
      socket.addEventListener('open', () => { connected = true; socket?.send(JSON.stringify({ type: 'auth', token: getApiAuthToken() })); if (active) setLive(true); });
      socket.addEventListener('message', (event) => { const payload = JSON.parse(String(event.data)) as { type?: string; entries?: Leader[] }; if (active && payload.type === 'leaderboard' && payload.entries) { setEntries(payload.entries); setLoading(false); } });
      socket.addEventListener('close', () => { connected = false; if (active) setLive(false); });
    } else setLive(false);
    const timer = window.setInterval(() => { if (!connected) load(); }, 5_000);
    return () => { active = false; window.clearInterval(timer); socket?.close(); };
  }, [auth, scope]);

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <header className="commerce-header"><div><h1>{text('Leaderboard', 'جدول رتبه‌بندی')}</h1><p>{live ? text('Live updates', 'به‌روزرسانی زنده') : text('Updating every 5 seconds', 'به‌روزرسانی هر ۵ ثانیه')}</p></div></header>
    <nav className="leaderboard-tabs" aria-label={text('Leaderboard period', 'بازه جدول رتبه‌بندی')}>{scopes.map((item) => <button className={scope === item.id ? 'active' : ''} key={item.id} onClick={() => setScope(item.id)}><span>{item.icon}</span><small>{text(item.en, item.fa)}</small></button>)}</nav>
    {loading && entries.length === 0 ? <section className="empty-state">{text('Loading leaderboard…', 'در حال بارگذاری رتبه‌بندی…')}</section> : entries.length === 0 ? <section className="empty-state">{scope === 'friends' ? text('Invite friends to see them here.', 'دوستان را دعوت کنید تا اینجا نمایش داده شوند.') : text('No ranking data for this period yet.', 'هنوز برای این بازه رتبه‌ای ثبت نشده است.')}</section> : <VirtualList className="leaderboard" items={entries} itemHeight={54} height={560} keyFor={(entry) => entry.userId} renderItem={(entry) => <div className={`leaderboard-entry ${entry.userId === currentUserId ? 'current-player' : ''}`}><b>{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${number(entry.rank)}`}</b><span>{entry.username}{entry.userId === currentUserId && <small>{text('You', 'شما')}</small>}</span><strong>{number(entry.coins)} MTX</strong></div>} />}
  </main>;
}
