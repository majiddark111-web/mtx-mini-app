import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VirtualList } from '../components/common/VirtualList';
import { useI18n } from '../hooks/useI18n';
import type { LeaderboardScope } from '../services/socialService';
import { useLeaderboard } from '../hooks/useLeaderboard';

const scopes: { id: LeaderboardScope; icon: string; en: string; fa: string }[] = [
  { id: 'global', icon: '🌍', en: 'Global', fa: 'کلی' },
  { id: 'friends', icon: '👥', en: 'Friends', fa: 'دوستان' },
  { id: 'weekly', icon: '📅', en: 'Weekly', fa: 'هفتگی' },
  { id: 'monthly', icon: '🗓️', en: 'Monthly', fa: 'ماهانه' },
  { id: 'season', icon: '🏆', en: 'Season', fa: 'فصل' },
];

export function LeaderboardPage() {
  const { text, number } = useI18n();
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const { auth, userId: currentUserId, entries, live, loading, error, retry } = useLeaderboard(scope);

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <header className="commerce-header"><div><h1>{text('Leaderboard', 'جدول رتبه‌بندی')}</h1><p>{live ? text('Live updates', 'به‌روزرسانی زنده') : text('Updating every 5 seconds', 'به‌روزرسانی هر ۵ ثانیه')}</p></div></header>
    <nav className="leaderboard-tabs" aria-label={text('Leaderboard period', 'بازه جدول رتبه‌بندی')}>{scopes.map((item) => <button className={scope === item.id ? 'active' : ''} key={item.id} onClick={() => setScope(item.id)}><span>{item.icon}</span><small>{text(item.en, item.fa)}</small></button>)}</nav>
    <p className="muted">{scope === 'global' || scope === 'friends' ? text('Ranked by current MTX balance', 'رتبه‌بندی بر اساس موجودی فعلی MTX') : text('Ranked by gameplay earnings in this UTC period; purchases and rewards excluded.', 'رتبه‌بندی بر اساس درآمد بازی در همین دورهٔ UTC؛ خرید سکه و جوایز محاسبه نمی‌شوند.')}</p>
    {auth !== 'authenticated' ? <section className="empty-state">{text('Reopen MTX in Telegram to view rankings.', 'برای مشاهدهٔ رتبه‌بندی، MTX را دوباره در تلگرام باز کنید.')}</section> : error ? <section className="empty-state" role="alert">{text('Leaderboard could not load. Please retry.', 'رتبه‌بندی دریافت نشد. دوباره تلاش کنید.')}<button className="button ghost" onClick={retry}>{text('Retry', 'تلاش دوباره')}</button></section> : loading && entries.length === 0 ? <section className="empty-state">{text('Loading leaderboard…', 'در حال بارگذاری رتبه‌بندی…')}</section> : entries.length === 0 ? <section className="empty-state">{scope === 'friends' ? text('Invite friends to see them here.', 'دوستان را دعوت کنید تا اینجا نمایش داده شوند.') : text('No ranking data for this period yet.', 'هنوز برای این بازه رتبه‌ای ثبت نشده است.')}</section> : <VirtualList key={currentUserId + ':' + scope + ':' + entries.length} className="leaderboard" items={entries} itemHeight={54} height={560} keyFor={(entry) => entry.userId} renderItem={(entry) => <div className={`leaderboard-entry ${entry.userId === currentUserId ? 'current-player' : ''}`}><b>{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${number(entry.rank)}`}</b><span>{entry.username}{entry.userId === currentUserId && <small>{text('You', 'شما')}</small>}</span><strong>{number(entry.coins)} MTX</strong></div>} />}
  </main>;
}
