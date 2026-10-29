import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CommerceCategoryTabs, type CommerceCategory } from '../components/CommerceCategoryTabs';
import { useInventoryActions } from '../hooks/useInventoryActions';
import { commerceItemIcon } from '../utils/commercePresentation';
import { useI18n } from '../hooks/useI18n';

const emptyInventory = { items: [], purchases: [], equippedSkin: null };

export function InventoryPage() {
  const { text, number } = useI18n();
  const request = useInventoryActions();
  const inventory = request.data ?? emptyInventory;
  const { activate, chooseSkin } = request;
  const activating = request.pending;
  const [category, setCategory] = useState<CommerceCategory>('all');
  const [newest, setNewest] = useState(true);
  const [limit, setLimit] = useState(40);
  const items = useMemo(() => inventory.items.filter((item) => category === 'all' || item.category === category).sort((a, b) => newest ? b.acquiredAt - a.acquiredAt : a.acquiredAt - b.acquiredAt), [category, inventory.items, newest]);
  const message = activating
    ? text('Saving…', 'ذخیره…')
    : request.success === 'boost:recharge'
      ? text('Recharge used once. Energy is now full.', 'بوست مصرف شد و انرژی کاملاً پر شد.')
      : request.success === 'consumable:energy'
        ? text('Energy Cell used once. 25% energy restored.', 'سلول انرژی مصرف شد و ۲۵٪ انرژی بازیابی شد.')
        : request.success === 'skin:aurora'
          ? text('Aurora Skin equipped.', 'اسکین شفق فعال شد.')
          : request.success === 'default'
            ? text('Default MTX appearance restored.', 'ظاهر پیش‌فرض MTX بازگردانده شد.') : '';
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Inventory', 'دارایی‌ها')}</h1><p>{text('Owned skins, boosts and consumables', 'اسکین‌ها، بوست‌ها و اقلام مصرفی شما')}</p></div><strong>{number(items.length)} {text('items', 'مورد')}</strong></header><CommerceCategoryTabs value={category} categories={['all', 'boost', 'skin', 'consumable']} onChange={(nextCategory) => { setCategory(nextCategory); setLimit(40); }} /><div className="inventory-sort"><button className="button ghost" onClick={() => setNewest((value) => !value)}>{newest ? text('Newest first', 'جدیدترین ابتدا') : text('Oldest first', 'قدیمی‌ترین ابتدا')}</button></div>{!request.data ? null : items.length === 0 ? <section className="empty-state">{text('No owned items in this category.', 'در این دسته دارایی ندارید.')}</section> : <><div className="product-grid">{items.slice(0, limit).map((item) => <article className="product-card deferred-card" key={item.itemId}><span className="product-icon" aria-hidden="true">{commerceItemIcon(item.itemId)}</span><span className="tag">{item.category}</span><h2>{item.itemId === 'skin:aurora' ? text('Aurora', 'شفق') : item.itemId === 'boost:recharge' ? text('Recharge boost', 'بوست شارژ') : text('Energy cell', 'سلول انرژی')}</h2>{item.itemId === 'boost:recharge' && <p>{text('One-time use: fills energy to maximum.', 'یک‌بار مصرف: انرژی را کاملاً پر می‌کند.')}</p>}{item.itemId === 'consumable:energy' && <p>{text('One-time use: restores 25% maximum energy.', 'یک‌بار مصرف: ۲۵٪ انرژی را بازیابی می‌کند.')}</p>}{item.itemId === 'skin:aurora' && <p>{text('Permanent cosmetic: changes the MTX coin appearance.', 'ظاهر دائمی سکه MTX را تغییر می‌دهد.')}</p>}<strong>{text('Quantity', 'تعداد')}: {number(item.quantity)}</strong>{item.itemId === 'boost:recharge' && <button className="button primary" disabled={!request.ready || item.quantity <= 0} onClick={() => void activate('boost:recharge')}>{activating === item.itemId ? text('Saving taps…', 'ذخیره تپ‌ها…') : text('Use once · Refill energy', 'استفاده · شارژ کامل انرژی')}</button>}{item.itemId === 'consumable:energy' && <button className="button primary" disabled={!request.ready || item.quantity <= 0} onClick={() => void activate('consumable:energy')}>{activating === item.itemId ? text('Saving taps…', 'ذخیره تپ‌ها…') : text('Use once · Restore 25%', 'استفاده · بازیابی ۲۵٪')}</button>}{item.itemId === 'skin:aurora' && <button className="button primary" disabled={!request.ready || item.quantity <= 0} onClick={() => void chooseSkin(inventory.equippedSkin === item.itemId ? null : 'skin:aurora')}>{(activating === item.itemId || activating === 'default') ? text('Saving…', 'ذخیره…') : inventory.equippedSkin === item.itemId ? text('Equipped · Use default', 'فعال · بازگشت به پیش‌فرض') : text('Equip Aurora', 'فعال‌کردن شفق')}</button>}</article>)}</div>{limit < items.length && <button className="button ghost load-more" onClick={() => setLimit((value) => value + 40)}>{text('Load more', 'نمایش بیشتر')}</button>}</>}{request.auth !== 'authenticated' && <p role="status">{text('Reopen MTX in Telegram to use inventory.', 'برای استفاده از دارایی‌ها، MTX را دوباره در تلگرام باز کنید.')}</p>}
    {request.loading && <p role="status">{text('Loading inventory…', 'در حال دریافت دارایی‌ها…')}</p>}
    {request.error && <section role="alert"><p>{text('Inventory result could not be confirmed. Refresh inventory before trying again.', 'نتیجهٔ عملیات دارایی تأیید نشد. پیش از تلاش دوباره، دارایی‌ها را به‌روز کنید.')}</p><button className="button ghost" onClick={request.retry}>{text('Refresh inventory', 'به‌روزرسانی دارایی‌ها')}</button></section>}
    {message && <p className="status-message" role="status">{message}</p>}<section className="purchase-history"><h2>{text('Purchase history', 'تاریخچه خرید')}</h2>{inventory.purchases.slice(0, 100).map((purchase) => <p key={purchase.id}>{purchase.itemId} · {number(purchase.price)} MTX</p>)}</section></main>;
}
