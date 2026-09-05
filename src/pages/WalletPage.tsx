import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { beginCell } from '@ton/core';
import { TonConnectButton, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { confirmTonPayment, createTonPaymentIntent, fetchTransactions, type TonPaymentIntent } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../hooks/useI18n';

const pendingPaymentKey = 'mtx_ton_pending_payment';
function restoredPendingPayment(): TonPaymentIntent | null {
  try { const value = JSON.parse(localStorage.getItem(pendingPaymentKey) ?? 'null') as TonPaymentIntent | null; if (value?.expiresAt && value.expiresAt > Date.now()) return value; }
  catch { /* Invalid local state is discarded. */ }
  localStorage.removeItem(pendingPaymentKey); return null;
}

function ConnectedWalletPage() {
  const { text, number } = useI18n();
  const authStatus = useAppStore((state) => state.authStatus); const wallet = useAppStore((state) => state.wallet); const setConnection = useAppStore((state) => state.setWalletConnection); const setTransactions = useAppStore((state) => state.setTransactions); const [message, setMessage] = useState(''); const [paying, setPaying] = useState(false); const [pendingIntent, setPendingIntent] = useState<TonPaymentIntent | null>(restoredPendingPayment); const address = useTonAddress(); const tonWallet = useTonWallet(); const restored = useIsConnectionRestored(); const [tonConnectUi] = useTonConnectUI();
  useEffect(() => { if (authStatus === 'authenticated') void fetchTransactions().then(setTransactions); }, [authStatus, setTransactions]);
  useEffect(() => { setConnection(address); if (tonWallet && tonWallet.account.chain !== '-3') setMessage(text('Switch the connected wallet to TON Testnet.', 'کیف پول متصل را به شبکه آزمایشی TON تغییر دهید.')); else setMessage(''); }, [address, setConnection, text, tonWallet]);
  const testnetConnected = Boolean(address && tonWallet?.account.chain === '-3');
  const payloadFor = (intent: TonPaymentIntent): string => {
    const bytes = beginCell().storeUint(0, 32).storeStringTail(intent.transactionId).endCell().toBoc();
    return btoa(String.fromCharCode(...bytes));
  };
  const finishPayment = async (intent: TonPaymentIntent): Promise<boolean> => {
    if (await confirmTonPayment(intent) !== 'confirmed') return false;
    localStorage.removeItem(pendingPaymentKey); setPendingIntent(null); setTransactions(await fetchTransactions()); setMessage(text(`${intent.creditedCoins} MTX credited after blockchain verification.`, `${number(intent.creditedCoins)} MTX پس از تأیید بلاکچین اضافه شد.`)); return true;
  };
  const checkPending = async () => {
    if (!pendingIntent || paying) return;
    setPaying(true); setMessage(text('Checking the pending transaction on TON Testnet…', 'در حال بررسی تراکنش معلق در شبکه آزمایشی TON…'));
    try { if (!await finishPayment(pendingIntent)) setMessage(text('The transaction is still pending. No additional payment is needed.', 'تراکنش هنوز معلق است؛ پرداخت دوباره لازم نیست.')); }
    catch (error) { setMessage(error instanceof Error ? error.message : text('Payment verification failed.', 'تأیید پرداخت ناموفق بود.')); }
    finally { setPaying(false); }
  };
  const pay = async () => {
    if (!tonWallet || !testnetConnected || paying || pendingIntent) return;
    setPaying(true); setMessage(text('Creating a secure payment order…', 'در حال ساخت سفارش پرداخت امن…'));
    try {
      const intent = await createTonPaymentIntent(tonWallet.account.address);
      await tonConnectUi.sendTransaction({ validUntil: Math.floor(Date.now() / 1_000) + 300, network: '-3', messages: [{ address: intent.recipient, amount: String(intent.amountNano), payload: payloadFor(intent) }] });
      localStorage.setItem(pendingPaymentKey, JSON.stringify(intent)); setPendingIntent(intent);
      setMessage(text('Transaction submitted. Waiting for Testnet confirmation…', 'تراکنش ارسال شد؛ منتظر تأیید شبکه آزمایشی باشید…'));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4_000));
        if (await finishPayment(intent)) return;
      }
      setMessage(text('Transaction submitted but still pending. Check again shortly.', 'تراکنش ارسال شده اما هنوز معلق است؛ کمی بعد بررسی کنید.'));
    } catch (error) { setMessage(error instanceof Error ? error.message : text('Testnet payment failed.', 'پرداخت آزمایشی ناموفق بود.')); }
    finally { setPaying(false); }
  };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Wallet', 'کیف پول')}</h1><p>{text('TON Testnet connection and payment status', 'اتصال شبکه آزمایشی TON و وضعیت پرداخت')}</p></div><span className={`wallet-dot ${testnetConnected ? 'connected' : ''}`} /></header><section className="wallet-card"><h2>{!restored ? text('Restoring wallet…', 'در حال بازیابی کیف پول…') : testnetConnected ? text('Testnet wallet connected', 'کیف پول آزمایشی متصل است') : text('Connect TON Testnet wallet', 'اتصال کیف پول آزمایشی TON')}</h2><p>{address || text('Connection is handled by the official TON Connect protocol.', 'اتصال از طریق پروتکل رسمی TON Connect انجام می‌شود.')}</p>{authStatus === 'authenticated' ? <TonConnectButton /> : <p>{text('Open MTX inside Telegram before connecting a wallet.', 'پیش از اتصال کیف پول، MTX را داخل تلگرام باز کنید.')}</p>}{testnetConnected && !pendingIntent && <button className="button primary" disabled={paying} onClick={() => void pay()}>{paying ? text('Verifying payment…', 'در حال تأیید پرداخت…') : text('Pay 0.01 TON · Get 100 MTX', 'پرداخت ۰٫۰۱ TON · دریافت ۱۰۰ MTX')}</button>}{testnetConnected && pendingIntent && <button className="button primary" disabled={paying} onClick={() => void checkPending()}>{paying ? text('Checking…', 'در حال بررسی…') : text('Check pending payment', 'بررسی پرداخت معلق')}</button>}{message && <p>{message}</p>}<small>{text('MTX is credited only after independent server-side blockchain verification.', 'MTX فقط پس از تأیید مستقل بلاکچین توسط سرور اضافه می‌شود.')}</small></section><section className="purchase-history"><h2>{text('Transactions', 'تراکنش‌ها')}</h2>{wallet.transactions.length === 0 ? <p>{text('No verified TON transactions.', 'تراکنش تأییدشده TON وجود ندارد.')}</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {number(transaction.amount)}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{number(transaction.creditedCoins)} MTX</small></article>)}</section></main>;
}

export function WalletPage() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><ConnectedWalletPage /></TonConnectUIProvider>;
}
