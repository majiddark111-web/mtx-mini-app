import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TonConnectButton, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { fetchTransactions } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';

function ConnectedWalletPage() {
  const authStatus = useAppStore((state) => state.authStatus); const wallet = useAppStore((state) => state.wallet); const setConnection = useAppStore((state) => state.setWalletConnection); const setTransactions = useAppStore((state) => state.setTransactions); const [message, setMessage] = useState(''); const address = useTonAddress(); const tonWallet = useTonWallet(); const restored = useIsConnectionRestored();
  useEffect(() => { if (authStatus === 'authenticated') void fetchTransactions().then(setTransactions); }, [authStatus, setTransactions]);
  useEffect(() => { setConnection(address); if (tonWallet && tonWallet.account.chain !== '-3') setMessage('Switch the connected wallet to TON Testnet.'); else setMessage(''); }, [address, setConnection, tonWallet]);
  const testnetConnected = Boolean(address && tonWallet?.account.chain === '-3');
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Wallet</h1><p>TON Testnet connection and payment status</p></div><span className={`wallet-dot ${testnetConnected ? 'connected' : ''}`} /></header><section className="wallet-card"><h2>{!restored ? 'Restoring wallet…' : testnetConnected ? 'Testnet wallet connected' : 'Connect TON Testnet wallet'}</h2><p>{address || 'Connection is handled by the official TON Connect protocol.'}</p>{authStatus === 'authenticated' ? <TonConnectButton /> : <p>Open MTX inside Telegram before connecting a wallet.</p>}{message && <p>{message}</p>}<small>Payments are disabled until server-side blockchain verification is configured.</small></section><section className="purchase-history"><h2>Transactions</h2>{wallet.transactions.length === 0 ? <p>No verified TON transactions.</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {transaction.amount}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{transaction.creditedCoins} MTX</small></article>)}</section></main>;
}

export function WalletPage() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><ConnectedWalletPage /></TonConnectUIProvider>;
}
