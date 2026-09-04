import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHistory, type HistoryResult } from '../services/historyService';
import { useAppStore } from '../store/useAppStore';
import { commerceItemIcon } from '../utils/commercePresentation';

type HistoryFilter = 'all' | 'purchase' | 'payment' | 'reward';
interface TimelineItem { id: string; type: Exclude<HistoryFilter, 'all'>; icon: string; title: string; detail: string; amount: string; createdAt: number; status?: string; }
const filters: Array<{ id: HistoryFilter; icon: string; label: string }> = [{ id: 'all', icon: '🕘', label: 'All' }, { id: 'purchase', icon: '🛍️', label: 'Purchases' }, { id: 'payment', icon: '💳', label: 'Payments' }, { id: 'reward', icon: '🎁', label: 'Rewards' }];

export function HistoryPage() {
  const auth = useAppStore((state) => state.authStatus);
  const [data, setData] = useState<HistoryResult>({ purchases: [], payments: [], rewards: [] });
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setData(await fetchHistory()); } catch { setError('History could not load. The server may be waking up.'); } finally { setLoading(false); } };
  useEffect(() => { if (auth === 'authenticated') void load(); }, [auth]);
  const items = useMemo<TimelineItem[]>(() => [
    ...data.purchases.map((item) => ({ id: item.id, type: 'purchase' as const, icon: commerceItemIcon(item.itemId), title: item.itemId.startsWith('upgrade:') ? 'Permanent upgrade' : 'Store purchase', detail: item.itemId.replace(':', ' · '), amount: `−${item.price.toLocaleString()} MTX`, createdAt: item.createdAt, status: 'completed' })),
    ...data.payments.map((item) => ({ id: item.transactionId, type: 'payment' as const, icon: '💎', title: `${item.asset} payment`, detail: `${item.amount} ${item.asset}`, amount: item.status === 'confirmed' ? `+${item.creditedCoins.toLocaleString()} MTX` : 'No credit', createdAt: item.createdAt, status: item.status })),
    ...data.rewards.map((item) => ({ id: item.id, type: 'reward' as const, icon: '🎁', title: item.title, detail: 'Verified server reward', amount: `+${item.amount.toLocaleString()} MTX`, createdAt: item.createdAt, status: 'claimed' })),
  ].filter((item) => filter === 'all' || item.type === filter).sort((a, b) => b.createdAt - a.createdAt), [data, filter]);
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Activity History</h1><p>Purchases, upgrades, payments and rewards</p></div></header><div className="history-tabs" role="tablist" aria-label="History filters">{filters.map((item) => <button className={filter === item.id ? 'active' : ''} aria-selected={filter === item.id} role="tab" type="button" key={item.id} onClick={() => setFilter(item.id)}><span>{item.icon}</span>{item.label}</button>)}</div>{auth !== 'authenticated' ? <section className="empty-state">Open MTX inside Telegram to view your private history.</section> : loading ? <section className="empty-state">Loading your history…</section> : error ? <section className="empty-state">{error}<button className="button ghost" onClick={() => void load()}>Retry</button></section> : items.length === 0 ? <section className="empty-state">No activity in this category yet.</section> : <section className="activity-list">{items.map((item) => <article className="activity-item" key={`${item.type}:${item.id}`}><span className="activity-icon">{item.icon}</span><div><strong>{item.title}</strong><p>{item.detail}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div><aside><strong className={item.amount.startsWith('+') ? 'positive' : ''}>{item.amount}</strong><small className={`activity-status ${item.status}`}>{item.status}</small></aside></article>)}</section>}</main>;
}
