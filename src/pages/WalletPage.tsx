import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { beginCell } from '@ton/core';
import { TonConnectButton, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { confirmTonPayment, createTonPaymentIntent, fetchTransactions, type TonPaymentIntent } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';

function ConnectedWalletPage() {
  const authStatus = useAppStore((state) => state.authStatus); const wallet = useAppStore((state) => state.wallet); const setConnection = useAppStore((state) => state.setWalletConnection); const setTransactions = useAppStore((state) => state.setTransactions); const [message, setMessage] = useState(''); const [paying, setPaying] = useState(false); const address = useTonAddress(); const tonWallet = useTonWallet(); const restored = useIsConnectionRestored(); const [tonConnectUi] = useTonConnectUI();
  useEffect(() => { if (authStatus === 'authenticated') void fetchTransactions().then(setTransactions); }, [authStatus, setTransactions]);
  useEffect(() => { setConnection(address); if (tonWallet && tonWallet.account.chain !== '-3') setMessage('Switch the connected wallet to TON Testnet.'); else setMessage(''); }, [address, setConnection, tonWallet]);
  const testnetConnected = Boolean(address && tonWallet?.account.chain === '-3');
  const payloadFor = (intent: TonPaymentIntent): string => {
    const bytes = beginCell().storeUint(0, 32).storeStringTail(intent.transactionId).endCell().toBoc();
    return btoa(String.fromCharCode(...bytes));
  };
  const pay = async () => {
    if (!tonWallet || !testnetConnected || paying) return;
    setPaying(true); setMessage('Creating a secure payment order…');
    try {
      const intent = await createTonPaymentIntent(tonWallet.account.address);
      await tonConnectUi.sendTransaction({ validUntil: Math.floor(Date.now() / 1_000) + 300, network: '-3', messages: [{ address: intent.recipient, amount: String(intent.amountNano), payload: payloadFor(intent) }] });
      setMessage('Transaction submitted. Waiting for Testnet confirmation…');
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4_000));
        if (await confirmTonPayment(intent) === 'confirmed') { setTransactions(await fetchTransactions()); setMessage(`${intent.creditedCoins} MTX credited after blockchain verification.`); return; }
      }
      setMessage('Transaction submitted but still pending. Check again shortly.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Testnet payment failed.'); }
    finally { setPaying(false); }
  };
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Wallet</h1><p>TON Testnet connection and payment status</p></div><span className={`wallet-dot ${testnetConnected ? 'connected' : ''}`} /></header><section className="wallet-card"><h2>{!restored ? 'Restoring wallet…' : testnetConnected ? 'Testnet wallet connected' : 'Connect TON Testnet wallet'}</h2><p>{address || 'Connection is handled by the official TON Connect protocol.'}</p>{authStatus === 'authenticated' ? <TonConnectButton /> : <p>Open MTX inside Telegram before connecting a wallet.</p>}{testnetConnected && <button className="button primary" disabled={paying} onClick={() => void pay()}>{paying ? 'Verifying payment…' : 'Pay 0.01 TON · Get 100 MTX'}</button>}{message && <p>{message}</p>}<small>MTX is credited only after independent server-side blockchain verification.</small></section><section className="purchase-history"><h2>Transactions</h2>{wallet.transactions.length === 0 ? <p>No verified TON transactions.</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {transaction.amount}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{transaction.creditedCoins} MTX</small></article>)}</section></main>;
}

export function WalletPage() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><ConnectedWalletPage /></TonConnectUIProvider>;
}
