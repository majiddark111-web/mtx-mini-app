import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CommerceCategoryTabs, type CommerceCategory } from '../components/CommerceCategoryTabs';
import { fetchCatalog, purchaseItem, type CatalogItem } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';
import { commerceItemIcon } from '../utils/commercePresentation';

export function StorePage() {
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
  const buy = async (item: CatalogItem) => { setMessage('Processing purchase…'); try { const result = await purchaseItem(item.id); setServerGameState(result.state); await load(); setMessage(`${item.title} purchased and activated.`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Purchase failed.'); } };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Store</h1><p>Server-priced items and upgrades</p></div><strong>{coins.toLocaleString()} MTX</strong></header>
    {authStatus !== 'authenticated' ? <section className="empty-state">Open MTX inside Telegram to use the secure store.</section> : loading && items.length === 0 ? <section className="empty-state">Waking up the Store server…</section> : <><CommerceCategoryTabs value={category} onChange={setCategory} /><details className="more-filters"><summary>More filters</summary><div className="commerce-tools"><input aria-label="Search store" placeholder="Search items" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Sort store items" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="featured">Featured first</option><option value="low">Lowest price</option><option value="high">Highest price</option></select></div></details>{visible.length === 0 ? <section className="empty-state">No items in this category.</section> : <div className="product-grid">{visible.map((item) => <article className="product-card" key={item.id}><span className="product-icon" aria-hidden="true">{commerceItemIcon(item.id)}</span>{item.featured && <span className="tag">Featured</span>}{item.limited && <span className="tag limited">Limited</span>}<h2>{item.title}</h2><p>{item.description}</p><strong>{item.price.toLocaleString()} MTX</strong><button className="button primary" disabled={item.owned || coins < item.price} onClick={() => void buy(item)}>{item.owned ? 'Owned' : coins < item.price ? `Need ${(item.price - coins).toLocaleString()} more` : 'Buy now'}</button></article>)}</div>}</>}{message && <div className="status-message"><span>{message}</span>{items.length === 0 && <button className="button ghost" disabled={loading} onClick={() => void load().catch(() => setMessage('Store is still unavailable. Try again shortly.'))}>Retry</button>}</div>}</main>;
}
