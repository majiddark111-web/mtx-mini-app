import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHistory, type HistoryResult } from '../services/historyService';
import { useRewardRequest } from '../hooks/useRewardRequest';
import { commerceItemIcon } from '../utils/commercePresentation';
import { useI18n } from '../hooks/useI18n';

type HistoryFilter = 'all' | 'purchase' | 'payment' | 'reward';
interface TimelineItem { id: string; type: Exclude<HistoryFilter, 'all'>; icon: string; title: string; detail: string; amount: string; createdAt: number; dateOnly?: string; status?: string; }
const emptyHistory: HistoryResult = { purchases: [], payments: [], rewards: [] };
const filters: Array<{ id: HistoryFilter; icon: string; en: string; fa: string }> = [{ id: 'all', icon: '🕘', en: 'All', fa: 'همه' }, { id: 'purchase', icon: '🛍️', en: 'Purchases', fa: 'خریدها' }, { id: 'payment', icon: '💳', en: 'Payments', fa: 'پرداخت‌ها' }, { id: 'reward', icon: '🎁', en: 'Rewards', fa: 'جوایز' }];

export function HistoryPage() {
  const { text, number, date } = useI18n();
  const request = useRewardRequest(fetchHistory);
  const { auth, loading, error } = request;
  const data: HistoryResult = request.data ?? emptyHistory;
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const items = useMemo<TimelineItem[]>(() => [
    ...data.purchases.map((item) => ({ id: item.id, type: 'purchase' as const, icon: commerceItemIcon(item.itemId), title: item.itemId.startsWith('upgrade:') ? text('Permanent upgrade', 'ارتقای دائمی') : text('Store purchase', 'خرید فروشگاه'), detail: item.itemId.replace(':', ' · '), amount: `−${number(item.price)} MTX`, createdAt: item.createdAt, status: text('completed', 'تکمیل‌شده') })),
    ...data.payments.map((item) => ({ id: item.transactionId, type: 'payment' as const, icon: '💎', title: `${item.asset} ${text('payment', 'پرداخت')}`, detail: `${number(item.amount)} ${item.asset}`, amount: item.status === 'confirmed' ? `+${number(item.creditedCoins)} MTX` : text('No credit', 'بدون اعتبار'), createdAt: item.createdAt, status: item.status === 'confirmed' ? text('confirmed', 'تأییدشده') : item.status === 'pending' ? text('pending', 'معلق') : item.status })),
    ...data.rewards.map((item) => ({ id: item.id, type: 'reward' as const, icon: '🎁', title: item.title, detail: text('Verified server reward', 'جایزه تأییدشده سرور'), amount: `+${number(item.amount)} MTX`, createdAt: item.createdAt, dateOnly: item.dateOnly, status: text('claimed', 'دریافت‌شده') })),
  ].filter((item) => filter === 'all' || item.type === filter).sort((a, b) => b.createdAt - a.createdAt), [data, filter, number, text]);
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Activity History', 'تاریخچه فعالیت')}</h1><p>{text('Purchases, upgrades, payments and rewards', 'خریدها، ارتقاها، پرداخت‌ها و جوایز')}</p><p className="muted">{text('Recent recorded activity; daily claims are archived from the archive update onward.', 'فعالیت‌های ثبت‌شدهٔ اخیر؛ دریافت‌های روزانه از زمان به‌روزرسانی آرشیو نگه‌داری می‌شوند.')}</p></div></header><div className="history-tabs" role="tablist" aria-label={text('History filters', 'فیلتر تاریخچه')}>{filters.map((item) => <button className={filter === item.id ? 'active' : ''} aria-selected={filter === item.id} role="tab" type="button" key={item.id} onClick={() => setFilter(item.id)}><span>{item.icon}</span>{text(item.en, item.fa)}</button>)}</div>{auth !== 'authenticated' ? <section className="empty-state">{text('Open MTX inside Telegram to view your private history.', 'برای مشاهده تاریخچه شخصی، MTX را داخل تلگرام باز کنید.')}</section> : loading ? <section className="empty-state">{text('Loading your history…', 'در حال بارگذاری تاریخچه…')}</section> : error ? <section className="empty-state" role="alert">{text('History could not load. Please retry.', 'تاریخچه بارگذاری نشد. ممکن است سرور در حال راه‌اندازی باشد.')}<button className="button ghost" onClick={request.retry}>{text('Retry', 'تلاش دوباره')}</button></section> : items.length === 0 ? <section className="empty-state">{text('No activity in this category yet.', 'هنوز فعالیتی در این دسته وجود ندارد.')}</section> : <section className="activity-list">{items.map((item) => <article className="activity-item" key={`${item.type}:${item.id}`}><span className="activity-icon">{item.icon}</span><div><strong>{item.title}</strong><p>{item.detail}</p><time>{item.dateOnly ? `${item.dateOnly} · ${text('UTC date; exact time unavailable', 'تاریخ UTC؛ ساعت دقیق موجود نیست')}` : date(item.createdAt)}</time></div><aside><strong className={item.amount.startsWith('+') ? 'positive' : ''}>{item.amount}</strong><small className={`activity-status ${item.status}`}>{item.status}</small></aside></article>)}</section>}</main>;
}
