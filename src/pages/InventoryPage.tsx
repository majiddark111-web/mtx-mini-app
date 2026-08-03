import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchInventory, type CatalogCategory } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';

export function InventoryPage() {
  const authStatus = useAppStore((state) => state.authStatus); const inventory = useAppStore((state) => state.inventory); const setInventory = useAppStore((state) => state.setInventory);
  const [category, setCategory] = useState<'all' | CatalogCategory>('all'); const [newest, setNewest] = useState(true);
  useEffect(() => { if (authStatus === 'authenticated') void fetchInventory().then((result) => setInventory(result.items, result.purchases)); }, [authStatus, setInventory]);
  const items = useMemo(() => inventory.items.filter((item) => category === 'all' || item.category === category).sort((a, b) => newest ? b.acquiredAt - a.acquiredAt : a.acquiredAt - b.acquiredAt), [category, inventory.items, newest]);
  return <main className="page commerce-page"><Link className="brand" to="/">Lumos</Link><header className="commerce-header"><div><h1>Inventory</h1><p>Owned skins, boosts and consumables</p></div><strong>{items.length} items</strong></header><div className="commerce-tools"><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="all">All</option><option value="boost">Boosts</option><option value="skin">Skins</option><option value="consumable">Consumables</option></select><button className="button ghost" onClick={() => setNewest((value) => !value)}>{newest ? 'Newest first' : 'Oldest first'}</button></div>{items.length === 0 ? <section className="empty-state">No owned items yet.</section> : <div className="product-grid">{items.map((item) => <article className="product-card" key={item.itemId}><span className="tag">{item.category}</span><h2>{item.itemId.split(':')[1]}</h2><strong>Quantity: {item.quantity}</strong></article>)}</div>}<section className="purchase-history"><h2>Purchase history</h2>{inventory.purchases.map((purchase) => <p key={purchase.id}>{purchase.itemId} · {purchase.price.toLocaleString()} MTX</p>)}</section></main>;
}

