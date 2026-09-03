import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCatalog, purchaseItem, type CatalogCategory, type CatalogItem } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';
import { commerceItemIcon } from '../utils/commercePresentation';

export function StorePage() {
  const authStatus = useAppStore((state) => state.authStatus);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [category, setCategory] = useState<'all' | CatalogCategory>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'featured' | 'low' | 'high'>('featured');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); setMessage(''); try { const result = await fetchCatalog(); setItems(result.items); setCoins(result.coins); } finally { setLoading(false); } };
  useEffect(() => { if (authStatus === 'authenticated') void load().catch(() => setMessage('Store could not load. The server may be waking up.')); }, [authStatus]);
  const visible = useMemo(() => items.filter((item) => (category === 'all' || item.category === category) && item.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : Number(b.featured) - Number(a.featured)), [category, items, search, sort]);
  const buy = async (item: CatalogItem) => { setMessage('Processing purchase…'); try { await purchaseItem(item.id); await load(); setMessage(`${item.title} purchased securely.`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Purchase failed.'); } };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Store</h1><p>Server-priced items and upgrades</p></div><strong>{coins.toLocaleString()} MTX</strong></header>
    {authStatus !== 'authenticated' ? <section className="empty-state">Open MTX inside Telegram to use the secure store.</section> : loading && items.length === 0 ? <section className="empty-state">Waking up the Store server…</section> : <><div className="commerce-tools"><input aria-label="Search store" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="all">All categories</option><option value="upgrade">Upgrades</option><option value="boost">Boosts</option><option value="skin">Skins</option><option value="consumable">Consumables</option></select><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="featured">Featured</option><option value="low">Price: low</option><option value="high">Price: high</option></select></div><div className="product-grid">{visible.map((item) => <article className="product-card" key={item.id}><span className="product-icon" aria-hidden="true">{commerceItemIcon(item.id)}</span>{item.featured && <span className="tag">Featured</span>}{item.limited && <span className="tag limited">Limited</span>}<h2>{item.title}</h2><p>{item.description}</p><strong>{item.price.toLocaleString()} MTX</strong><button className="button primary" disabled={item.owned || coins < item.price} onClick={() => void buy(item)}>{item.owned ? 'Owned' : 'Buy'}</button></article>)}</div></>}{message && <div className="status-message"><span>{message}</span>{items.length === 0 && <button className="button ghost" disabled={loading} onClick={() => void load().catch(() => setMessage('Store is still unavailable. Try again shortly.'))}>Retry</button>}</div>}</main>;
}
