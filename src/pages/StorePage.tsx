import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CommerceCategoryTabs, type CommerceCategory } from '../components/CommerceCategoryTabs';
import { fetchCatalog, purchaseItem, type CatalogItem } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';
import { commerceItemIcon } from '../utils/commercePresentation';
import { useI18n } from '../hooks/useI18n';

export function StorePage() {
  const { fa, text, number } = useI18n();
  const [searchParams] = useSearchParams();
  const authStatus = useAppStore((state) => state.authStatus);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [coins, setCoins] = useState(0);
  const requestedCategory = searchParams.get('category');
  const [category, setCategory] = useState<CommerceCategory>(requestedCategory === 'upgrade' || requestedCategory === 'boost' || requestedCategory === 'skin' || requestedCategory === 'consumable' ? requestedCategory : 'all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'featured' | 'low' | 'high'>('featured');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  const load = async () => { setLoading(true); setMessage(''); try { const result = await fetchCatalog(); setItems(result.items); setCoins(result.coins); } finally { setLoading(false); } };
  useEffect(() => { if (authStatus === 'authenticated') void load().catch(() => setMessage('Store could not load. The server may be waking up.')); }, [authStatus]);
  const visible = useMemo(() => items.filter((item) => (category === 'all' || item.category === category) && item.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : Number(b.featured) - Number(a.featured)), [category, items, search, sort]);
  const itemTitle = (item: CatalogItem) => !fa ? item.title : item.id === 'skin:aurora' ? 'اسکین شفق' : item.id === 'boost:recharge' ? 'بوست شارژ کامل' : item.id === 'consumable:energy' ? 'سلول انرژی' : item.id.startsWith('upgrade:tap') ? 'ارتقای قدرت تپ' : item.id.startsWith('upgrade:energy') ? 'ارتقای ظرفیت انرژی' : 'ارتقای درآمد ساعتی';
  const itemDescription = (item: CatalogItem) => !fa ? item.description : item.id === 'skin:aurora' ? 'ظاهر شفق برای سکه MTX' : item.id === 'boost:recharge' ? 'شارژ یک‌باره انرژی تا حداکثر' : item.id === 'consumable:energy' ? 'بازیابی ۲۵٪ حداکثر انرژی' : 'ارتقای دائمی و ذخیره‌شده روی سرور';
  const buy = async (item: CatalogItem) => { setMessage(text('Processing purchase…', 'در حال پردازش خرید…')); try { const result = await purchaseItem(item.id); setServerGameState(result.state); await load(); setMessage(text(`${item.title} purchased and activated.`, `${itemTitle(item)} خریداری و فعال شد.`)); } catch (error) { setMessage(error instanceof Error ? error.message : text('Purchase failed.', 'خرید ناموفق بود.')); } };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Store', 'فروشگاه')}</h1><p>{text('Server-priced items and upgrades', 'محصولات و ارتقاهای قیمت‌گذاری‌شده توسط سرور')}</p></div><strong>{number(coins)} MTX</strong></header>
    {authStatus !== 'authenticated' ? <section className="empty-state">{text('Open MTX inside Telegram to use the secure store.', 'برای استفاده از فروشگاه امن، MTX را داخل تلگرام باز کنید.')}</section> : loading && items.length === 0 ? <section className="empty-state">{text('Waking up the Store server…', 'در حال راه‌اندازی سرور فروشگاه…')}</section> : <><CommerceCategoryTabs value={category} onChange={setCategory} /><details className="more-filters"><summary>{text('More filters', 'فیلترهای بیشتر')}</summary><div className="commerce-tools"><input aria-label={text('Search store', 'جست‌وجوی فروشگاه')} placeholder={text('Search items', 'جست‌وجوی محصول')} value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={text('Sort store items', 'مرتب‌سازی محصولات')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="featured">{text('Featured first', 'ویژه‌ها ابتدا')}</option><option value="low">{text('Lowest price', 'کمترین قیمت')}</option><option value="high">{text('Highest price', 'بیشترین قیمت')}</option></select></div></details>{visible.length === 0 ? <section className="empty-state">{text('No items in this category.', 'محصولی در این دسته وجود ندارد.')}</section> : <div className="product-grid">{visible.map((item) => <article className="product-card" key={item.id}><span className="product-icon" aria-hidden="true">{commerceItemIcon(item.id)}</span>{item.featured && <span className="tag">{text('Featured', 'ویژه')}</span>}{item.limited && <span className="tag limited">{text('Limited', 'محدود')}</span>}<h2>{itemTitle(item)}</h2><p>{itemDescription(item)}</p><strong>{number(item.price)} MTX</strong><button className="button primary" disabled={item.owned || coins < item.price} onClick={() => void buy(item)}>{item.owned ? text('Owned', 'خریداری‌شده') : coins < item.price ? `${text('Need', 'نیاز به')} ${number(item.price - coins)} MTX` : text('Buy now', 'خرید')}</button></article>)}</div>}</>}{message && <div className="status-message"><span>{message}</span>{items.length === 0 && <button className="button ghost" disabled={loading} onClick={() => void load().catch(() => setMessage(text('Store is still unavailable. Try again shortly.', 'فروشگاه هنوز در دسترس نیست. کمی بعد دوباره تلاش کنید.')))}>{text('Retry', 'تلاش دوباره')}</button>}</div>}</main>;
}
