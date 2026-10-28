import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { beginCell } from '@ton/core';
import { TonConnectButton, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { confirmTonPayment, createTonPaymentIntent, fetchPendingPayments, fetchTransactions, type TonPaymentIntent } from '../services/commerceService';
import { preparePaymentOrder, pendingPayments, removeConfirmedPayment, savePendingPayment } from '../services/pendingPaymentService';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../hooks/useI18n';

function ConnectedWalletPage() {
  const { text, number } = useI18n();
  const authStatus = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const wallet = useAppStore((state) => state.wallet);
  const setConnection = useAppStore((state) => state.setWalletConnection);
  const setTransactions = useAppStore((state) => state.setTransactions);
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [orders, setOrders] = useState<TonPaymentIntent[]>([]);
  const [separatePurchase, setSeparatePurchase] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const address = useTonAddress();
  const tonWallet = useTonWallet();
  const restored = useIsConnectionRestored();
  const [tonConnectUi] = useTonConnectUI();
  const currentAccount = () => mounted.current && useAppStore.getState().user.id === userId && useAppStore.getState().authStatus === 'authenticated';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setConnection(address); }, [address, setConnection]);
  useEffect(() => {
    let active = true;
    setOrders([]); setLoaded(false); setMessage(''); setTransactions([]); setSeparatePurchase(false);
    if (authStatus !== 'authenticated' || !userId) return;
    void (async () => {
      try {
        const local = pendingPayments(localStorage, userId);
        if (active) setOrders(local);
        const [remote, transactions] = await Promise.all([fetchPendingPayments(), fetchTransactions()]);
        if (!active) return;
        const confirmed = new Set(transactions.filter((item) => item.status === 'confirmed').map((item) => item.transactionId));
        const merged = new Map([...local, ...remote.intents].filter((item) => !confirmed.has(item.transactionId)).map((item) => [item.transactionId, item]));
        for (const id of confirmed) removeConfirmedPayment(localStorage, userId, id);
        for (const order of merged.values()) savePendingPayment(localStorage, userId, order);
        setOrders([...merged.values()]); setTransactions(transactions); setLoaded(true);
        if (remote.hasMore) setMessage(text('More than 100 pending orders exist. Resolve the displayed orders first; older orders remain on the server.', 'بیش از ۱۰۰ سفارش معلق وجود دارد؛ ابتدا این سفارش‌ها را بررسی کنید. سفارش‌های قدیمی‌تر روی سرور محفوظ‌اند.'));
        else if (localStorage.getItem('mtx_ton_pending_payment')) setMessage(text('A legacy payment record exists on this device. Keep it for review; do not clear app data or repay that order.', 'یک سابقهٔ پرداخت از نسخهٔ قدیمی روی دستگاه وجود دارد؛ برای بررسی نگه دارید و داده‌ها را پاک نکنید یا آن پرداخت را تکرار نکنید.'));
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : text('Payment recovery failed. Retry before making a new payment.', 'بازیابی پرداخت‌ها ناموفق بود؛ پیش از پرداخت جدید دوباره بررسی کنید.')); }
    })();
    return () => { active = false; };
  }, [authStatus, userId, reload, setTransactions, text]);

  const testnetConnected = Boolean(address && tonWallet?.account.chain === '-3');
  const checkPending = async (intent: TonPaymentIntent) => {
    if (busy.current || !currentAccount()) return;
    busy.current = true; setPaying(true);
    try {
      const result = await confirmTonPayment(intent);
      if (!currentAccount()) return;
      if (result === 'confirmed') {
        removeConfirmedPayment(localStorage, userId, intent.transactionId);
        setOrders((items) => items.filter((item) => item.transactionId !== intent.transactionId));
        setMessage(text('Payment confirmed by the server. The same order is never credited twice.', 'پرداخت توسط سرور تأیید شد. همین سفارش دوباره امتیاز نمی‌گیرد.'));
        const transactions = await fetchTransactions();
        if (currentAccount()) setTransactions(transactions);
      } else setMessage(text('Not confirmed yet. Keep this order; no additional payment is needed.', 'هنوز تأیید نشده است. این سفارش را نگه دارید؛ پرداخت دوباره لازم نیست.'));
    } catch (error) { if (currentAccount()) setMessage(error instanceof Error ? error.message : text('Verification unavailable; the order is retained.', 'تأیید فعلاً ممکن نیست؛ سفارش نگه‌داری شد.')); }
    finally { busy.current = false; if (mounted.current) setPaying(false); }
  };

  const pay = async () => {
    if (!tonWallet || !testnetConnected || busy.current || !loaded || !currentAccount() || (orders.length > 0 && !separatePurchase)) return;
    busy.current = true; setPaying(true);
    setMessage(text('Saving your payment order before opening the wallet…', 'در حال ذخیرهٔ سفارش پیش از بازکردن کیف پول…'));
    try {
      const intent = await preparePaymentOrder(localStorage, userId, tonWallet.account.address, createTonPaymentIntent);
      if (!currentAccount()) return;
      setSeparatePurchase(false);
      setOrders((items) => [...items.filter((item) => item.transactionId !== intent.transactionId), intent]);
      if (intent.replayed || intent.expiresAt <= Date.now()) {
        setMessage(text('Previous order recovered. Check it below; no transaction was resent.', 'سفارش قبلی بازیابی شد. پایین صفحه بررسی کنید؛ تراکنشی دوباره ارسال نشد.')); return;
      }
      const payload = beginCell().storeUint(0, 32).storeStringTail(intent.transactionId).endCell().toBoc();
      await tonConnectUi.sendTransaction({ validUntil: Math.min(Math.floor(intent.expiresAt / 1000), Math.floor(Date.now() / 1000) + 300), network: '-3', from: tonWallet.account.address, messages: [{ address: intent.recipient, amount: String(intent.amountNano), payload: btoa(String.fromCharCode(...payload)) }] });
      if (currentAccount()) setMessage(text('Wallet request returned. Use Check payment below to verify on the blockchain; do not pay again.', 'درخواست کیف پول برگشت. با «بررسی پرداخت» تأیید بلاکچین را بررسی کنید؛ دوباره پرداخت نکنید.'));
    } catch (error) {
      if (currentAccount()) setMessage(text('Wallet outcome may be unknown or cancelled. Any saved order remains below. Check it before starting another payment. ', 'نتیجهٔ کیف پول ممکن است نامشخص یا لغوشده باشد. سفارش ذخیره‌شده پایین صفحه باقی می‌ماند؛ قبل از پرداخت جدید آن را بررسی کنید. ') + (error instanceof Error ? error.message : ''));
    } finally { busy.current = false; if (mounted.current) setPaying(false); }
  };

  return <main className="page commerce-page wallet-page">
    <Link className="brand" to="/">MTX</Link>
    <header className="commerce-header"><div><h1>{text('Wallet', 'کیف پول')}</h1><p>{text('TON Testnet connection and payment status', 'اتصال شبکه آزمایشی TON و وضعیت پرداخت')}</p></div><span className={`wallet-dot ${testnetConnected ? 'connected' : ''}`} /></header>
    <section className="wallet-card">
      <h2>{!restored ? text('Restoring wallet…', 'در حال بازیابی کیف پول…') : testnetConnected ? text('Testnet wallet connected', 'کیف پول آزمایشی متصل است') : text('Connect TON Testnet wallet', 'اتصال کیف پول آزمایشی TON')}</h2>
      <p>{address || text('Connect through TON Connect.', 'از طریق TON Connect متصل شوید.')}</p>
      {authStatus === 'authenticated' ? <TonConnectButton /> : <p>{text('Open MTX inside Telegram and sign in first.', 'ابتدا MTX را در تلگرام باز کنید و وارد شوید.')}</p>}
      {tonWallet && !testnetConnected && <p>{text('Switch your wallet to TON Testnet.', 'کیف پول را به شبکه آزمایشی TON تغییر دهید.')}</p>}
      {authStatus === 'authenticated' && <button className="button ghost" disabled={paying} onClick={() => setReload((value) => value + 1)}>{text('Recover payment orders', 'بازیابی سفارش‌های پرداخت')}</button>}
      {orders.length > 0 && <p>{text('Unresolved orders exist. Check them first. A new order is a separate purchase, not a retry.', 'سفارش حل‌نشده دارید؛ ابتدا بررسی کنید. سفارش جدید یک خرید جداگانه است، نه تکرار بررسی.')}</p>}
      {orders.length > 0 && <label><input type="checkbox" checked={separatePurchase} disabled={paying} onChange={(event) => setSeparatePurchase(event.target.checked)} />{text('I intend a separate purchase, not a retry of an unresolved order.', 'قصد خرید جداگانه دارم، نه تکرار پرداخت سفارش حل‌نشده.')}</label>}
      {testnetConnected && authStatus === 'authenticated' && <button className="button primary" disabled={paying || !loaded || (orders.length > 0 && !separatePurchase)} onClick={() => void pay()}>{text('New Testnet purchase · review amount in wallet', 'خرید آزمایشی جدید · مبلغ را در کیف پول بررسی کنید')}</button>}
      {message && <p role="status">{message}</p>}
      <small>{text('Only server-verified blockchain payments earn MTX. Orders remain recoverable after the sending deadline.', 'فقط پرداخت تأییدشدهٔ بلاکچین توسط سرور امتیاز می‌گیرد. پس از مهلت ارسال هم سفارش قابل پیگیری است.')}</small>
    </section>
    <section className="purchase-history"><h2>{text('Unresolved payment orders', 'سفارش‌های پرداخت حل‌نشده')}</h2>
      {orders.length > 0 && <p className="payment-order-help" id="payment-check-help">{text('Check payment only verifies an existing order. It does not send TON or start a new purchase.', '«بررسی پرداخت» فقط وضعیت سفارش قبلی را بررسی می‌کند؛ TON ارسال نمی‌کند و خرید جدیدی نمی‌سازد.')}</p>}
      {orders.map((intent) => <article className="payment-order" key={intent.transactionId}>
        <div className="payment-order-details">
          <span className="payment-order-label">{text('Order ID', 'شناسهٔ سفارش')}</span>
          <code className="payment-order-id" dir="ltr">{intent.transactionId}</code>
          <div className="payment-order-summary"><span><bdi>{number(intent.amountNano / 1_000_000_000)} TON</bdi></span><span><bdi>{number(intent.creditedCoins)} MTX</bdi></span></div>
        </div>
        <button className="button primary payment-check-button" aria-describedby="payment-check-help" disabled={paying || authStatus !== 'authenticated'} onClick={() => void checkPending(intent)}>{paying ? text('Please wait…', 'لطفاً صبر کنید…') : text('Check payment', 'بررسی پرداخت')}</button>
      </article>)}
    </section>
    <section className="purchase-history"><h2>{text('Transactions', 'تراکنش‌ها')}</h2>{wallet.transactions.length === 0 ? <p>{text('No verified TON transactions.', 'تراکنش تأییدشده TON وجود ندارد.')}</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {number(transaction.amount)}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{number(transaction.creditedCoins)} MTX</small></article>)}</section>
  </main>;
}

export function WalletPage() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><ConnectedWalletPage /></TonConnectUIProvider>;
}
