import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHistory, type HistoryResult } from '../services/historyService';
import { useAppStore } from '../store/useAppStore';
import { commerceItemIcon } from '../utils/commercePresentation';
import { useI18n } from '../hooks/useI18n';

type HistoryFilter = 'all' | 'purchase' | 'payment' | 'reward';
interface TimelineItem { id: string; type: Exclude<HistoryFilter, 'all'>; icon: string; title: string; detail: string; amount: string; createdAt: number; status?: string; }
const filters: Array<{ id: HistoryFilter; icon: string; en: string; fa: string }> = [{ id: 'all', icon: '🕘', en: 'All', fa: 'همه' }, { id: 'purchase', icon: '🛍️', en: 'Purchases', fa: 'خریدها' }, { id: 'payment', icon: '💳', en: 'Payments', fa: 'پرداخت‌ها' }, { id: 'reward', icon: '🎁', en: 'Rewards', fa: 'جوایز' }];

export function HistoryPage() {
  const { text, number, date } = useI18n();
  const auth = useAppStore((state) => state.authStatus);
  const [data, setData] = useState<HistoryResult>({ purchases: [], payments: [], rewards: [] });
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setData(await fetchHistory()); } catch { setError('History could not load. The server may be waking up.'); } finally { setLoading(false); } };
  useEffect(() => { if (auth === 'authenticated') void load(); }, [auth]);
  const items = useMemo<TimelineItem[]>(() => [
    ...data.purchases.map((item) => ({ id: item.id, type: 'purchase' as const, icon: commerceItemIcon(item.itemId), title: item.itemId.startsWith('upgrade:') ? text('Permanent upgrade', 'ارتقای دائمی') : text('Store purchase', 'خرید فروشگاه'), detail: item.itemId.replace(':', ' · '), amount: `−${number(item.price)} MTX`, createdAt: item.createdAt, status: text('completed', 'تکمیل‌شده') })),
    ...data.payments.map((item) => ({ id: item.transactionId, type: 'payment' as const, icon: '💎', title: `${item.asset} ${text('payment', 'پرداخت')}`, detail: `${number(item.amount)} ${item.asset}`, amount: item.status === 'confirmed' ? `+${number(item.creditedCoins)} MTX` : text('No credit', 'بدون اعتبار'), createdAt: item.createdAt, status: item.status === 'confirmed' ? text('confirmed', 'تأییدشده') : item.status === 'pending' ? text('pending', 'معلق') : item.status })),
    ...data.rewards.map((item) => ({ id: item.id, type: 'reward' as const, icon: '🎁', title: item.title, detail: text('Verified server reward', 'جایزه تأییدشده سرور'), amount: `+${number(item.amount)} MTX`, createdAt: item.createdAt, status: text('claimed', 'دریافت‌شده') })),
  ].filter((item) => filter === 'all' || item.type === filter).sort((a, b) => b.createdAt - a.createdAt), [data, filter, number, text]);
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Activity History', 'تاریخچه فعالیت')}</h1><p>{text('Purchases, upgrades, payments and rewards', 'خریدها، ارتقاها، پرداخت‌ها و جوایز')}</p></div></header><div className="history-tabs" role="tablist" aria-label={text('History filters', 'فیلتر تاریخچه')}>{filters.map((item) => <button className={filter === item.id ? 'active' : ''} aria-selected={filter === item.id} role="tab" type="button" key={item.id} onClick={() => setFilter(item.id)}><span>{item.icon}</span>{text(item.en, item.fa)}</button>)}</div>{auth !== 'authenticated' ? <section className="empty-state">{text('Open MTX inside Telegram to view your private history.', 'برای مشاهده تاریخچه شخصی، MTX را داخل تلگرام باز کنید.')}</section> : loading ? <section className="empty-state">{text('Loading your history…', 'در حال بارگذاری تاریخچه…')}</section> : error ? <section className="empty-state">{text(error, 'تاریخچه بارگذاری نشد. ممکن است سرور در حال راه‌اندازی باشد.')}<button className="button ghost" onClick={() => void load()}>{text('Retry', 'تلاش دوباره')}</button></section> : items.length === 0 ? <section className="empty-state">{text('No activity in this category yet.', 'هنوز فعالیتی در این دسته وجود ندارد.')}</section> : <section className="activity-list">{items.map((item) => <article className="activity-item" key={`${item.type}:${item.id}`}><span className="activity-icon">{item.icon}</span><div><strong>{item.title}</strong><p>{item.detail}</p><time>{date(item.createdAt)}</time></div><aside><strong className={item.amount.startsWith('+') ? 'positive' : ''}>{item.amount.replace(/[\d,]+/, (value) => number(Number(value.replace(/,/g, ''))))}</strong><small className={`activity-status ${item.status}`}>{item.status}</small></aside></article>)}</section>}</main>;
}
