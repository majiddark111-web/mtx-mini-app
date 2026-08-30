import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { beginCell } from '@ton/core';
import { TonConnectButton, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { confirmTonPayment, createTonPaymentIntent, fetchTransactions, type TonPaymentIntent } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';

const pendingPaymentKey = 'mtx_ton_pending_payment';
function restoredPendingPayment(): TonPaymentIntent | null {
  try { const value = JSON.parse(localStorage.getItem(pendingPaymentKey) ?? 'null') as TonPaymentIntent | null; if (value?.expiresAt && value.expiresAt > Date.now()) return value; }
  catch { /* Invalid local state is discarded. */ }
  localStorage.removeItem(pendingPaymentKey); return null;
}

function ConnectedWalletPage() {
  const authStatus = useAppStore((state) => state.authStatus); const wallet = useAppStore((state) => state.wallet); const setConnection = useAppStore((state) => state.setWalletConnection); const setTransactions = useAppStore((state) => state.setTransactions); const [message, setMessage] = useState(''); const [paying, setPaying] = useState(false); const [pendingIntent, setPendingIntent] = useState<TonPaymentIntent | null>(restoredPendingPayment); const address = useTonAddress(); const tonWallet = useTonWallet(); const restored = useIsConnectionRestored(); const [tonConnectUi] = useTonConnectUI();
  useEffect(() => { if (authStatus === 'authenticated') void fetchTransactions().then(setTransactions); }, [authStatus, setTransactions]);
  useEffect(() => { setConnection(address); if (tonWallet && tonWallet.account.chain !== '-3') setMessage('Switch the connected wallet to TON Testnet.'); else setMessage(''); }, [address, setConnection, tonWallet]);
  const testnetConnected = Boolean(address && tonWallet?.account.chain === '-3');
  const payloadFor = (intent: TonPaymentIntent): string => {
    const bytes = beginCell().storeUint(0, 32).storeStringTail(intent.transactionId).endCell().toBoc();
    return btoa(String.fromCharCode(...bytes));
  };
  const finishPayment = async (intent: TonPaymentIntent): Promise<boolean> => {
    if (await confirmTonPayment(intent) !== 'confirmed') return false;
    localStorage.removeItem(pendingPaymentKey); setPendingIntent(null); setTransactions(await fetchTransactions()); setMessage(`${intent.creditedCoins} MTX credited after blockchain verification.`); return true;
  };
  const checkPending = async () => {
    if (!pendingIntent || paying) return;
    setPaying(true); setMessage('Checking the pending transaction on TON Testnet…');
    try { if (!await finishPayment(pendingIntent)) setMessage('The transaction is still pending. No additional payment is needed.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Payment verification failed.'); }
    finally { setPaying(false); }
  };
  const pay = async () => {
    if (!tonWallet || !testnetConnected || paying || pendingIntent) return;
    setPaying(true); setMessage('Creating a secure payment order…');
    try {
      const intent = await createTonPaymentIntent(tonWallet.account.address);
      await tonConnectUi.sendTransaction({ validUntil: Math.floor(Date.now() / 1_000) + 300, network: '-3', messages: [{ address: intent.recipient, amount: String(intent.amountNano), payload: payloadFor(intent) }] });
      localStorage.setItem(pendingPaymentKey, JSON.stringify(intent)); setPendingIntent(intent);
      setMessage('Transaction submitted. Waiting for Testnet confirmation…');
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4_000));
        if (await finishPayment(intent)) return;
      }
      setMessage('Transaction submitted but still pending. Check again shortly.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Testnet payment failed.'); }
    finally { setPaying(false); }
  };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Wallet</h1><p>TON Testnet connection and payment status</p></div><span className={`wallet-dot ${testnetConnected ? 'connected' : ''}`} /></header><section className="wallet-card"><h2>{!restored ? 'Restoring wallet…' : testnetConnected ? 'Testnet wallet connected' : 'Connect TON Testnet wallet'}</h2><p>{address || 'Connection is handled by the official TON Connect protocol.'}</p>{authStatus === 'authenticated' ? <TonConnectButton /> : <p>Open MTX inside Telegram before connecting a wallet.</p>}{testnetConnected && !pendingIntent && <button className="button primary" disabled={paying} onClick={() => void pay()}>{paying ? 'Verifying payment…' : 'Pay 0.01 TON · Get 100 MTX'}</button>}{testnetConnected && pendingIntent && <button className="button primary" disabled={paying} onClick={() => void checkPending()}>{paying ? 'Checking…' : 'Check pending payment'}</button>}{message && <p>{message}</p>}<small>MTX is credited only after independent server-side blockchain verification.</small></section><section className="purchase-history"><h2>Transactions</h2>{wallet.transactions.length === 0 ? <p>No verified TON transactions.</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {transaction.amount}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{transaction.creditedCoins} MTX</small></article>)}</section></main>;
}

export function WalletPage() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><ConnectedWalletPage /></TonConnectUIProvider>;
}
