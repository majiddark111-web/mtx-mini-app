import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { activateInventoryItem, fetchInventory, type CatalogCategory } from '../services/commerceService';
import { syncTapBatch } from '../services/gameApiService';
import { acknowledgeTapBatch, nextTapBatch, sealActiveBatch, tapBatchDuration } from '../services/tapOutboxService';
import { runTapSync, waitForTapSyncIdle } from '../services/tapSyncCoordinator';
import { useAppStore } from '../store/useAppStore';

export function InventoryPage() {
  const authStatus = useAppStore((state) => state.authStatus); const userId = useAppStore((state) => state.user.id); const inventory = useAppStore((state) => state.inventory); const setInventory = useAppStore((state) => state.setInventory); const setServerGameState = useAppStore((state) => state.setServerGameState);
  const [category, setCategory] = useState<'all' | CatalogCategory>('all'); const [newest, setNewest] = useState(true); const [limit, setLimit] = useState(40); const [message, setMessage] = useState(''); const [activating, setActivating] = useState('');
  useEffect(() => { if (authStatus === 'authenticated') void fetchInventory().then((result) => setInventory(result.items, result.purchases)); }, [authStatus, setInventory]);
  const items = useMemo(() => inventory.items.filter((item) => category === 'all' || item.category === category).sort((a, b) => newest ? b.acquiredAt - a.acquiredAt : a.acquiredAt - b.acquiredAt), [category, inventory.items, newest]);
  const flushPendingTaps = async () => {
    if (!userId) throw new Error('Telegram session required');
    await waitForTapSyncIdle(); sealActiveBatch(localStorage, userId);
    let batch = nextTapBatch(localStorage, userId);
    while (batch) { const state = await runTapSync(() => syncTapBatch(batch!.taps, tapBatchDuration(batch!), batch!.batchId)); acknowledgeTapBatch(localStorage, userId, batch.batchId); setServerGameState(state); batch = nextTapBatch(localStorage, userId); }
  };
  const activate = async (itemId: 'boost:recharge') => { setActivating(itemId); setMessage('Saving pending taps before using Recharge…'); try { await flushPendingTaps(); const result = await activateInventoryItem(itemId); setServerGameState(result.state); setInventory(result.items, inventory.purchases); setMessage('Recharge used once. Energy is now full.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Activation failed.'); } finally { setActivating(''); } };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Inventory</h1><p>Owned skins, boosts and consumables</p></div><strong>{items.length} items</strong></header><div className="commerce-tools"><select value={category} onChange={(event) => { setCategory(event.target.value as typeof category); setLimit(40); }}><option value="all">All</option><option value="boost">Boosts</option><option value="skin">Skins</option><option value="consumable">Consumables</option></select><button className="button ghost" onClick={() => setNewest((value) => !value)}>{newest ? 'Newest first' : 'Oldest first'}</button></div>{items.length === 0 ? <section className="empty-state">No owned items yet.</section> : <><div className="product-grid">{items.slice(0, limit).map((item) => <article className="product-card deferred-card" key={item.itemId}><span className="tag">{item.category}</span><h2>{item.itemId.split(':')[1]}</h2><p>One-time use: fills energy to maximum.</p><strong>Quantity: {item.quantity}</strong>{item.itemId === 'boost:recharge' && <button className="button primary" disabled={activating === item.itemId} onClick={() => void activate('boost:recharge')}>{activating === item.itemId ? 'Saving taps…' : 'Use once · Refill energy'}</button>}</article>)}</div>{limit < items.length && <button className="button ghost load-more" onClick={() => setLimit((value) => value + 40)}>Load more</button>}</>}{message && <p className="status-message">{message}</p>}<section className="purchase-history"><h2>Purchase history</h2>{inventory.purchases.slice(0, 100).map((purchase) => <p key={purchase.id}>{purchase.itemId} · {purchase.price.toLocaleString()} MTX</p>)}</section></main>;
}
