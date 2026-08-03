import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTransactions } from '../services/commerceService';
import { tonConnect } from '../services/walletProvider';
import { useAppStore } from '../store/useAppStore';

export function WalletPage() {
  const authStatus = useAppStore((state) => state.authStatus); const wallet = useAppStore((state) => state.wallet); const setConnection = useAppStore((state) => state.setWalletConnection); const setTransactions = useAppStore((state) => state.setTransactions); const [message, setMessage] = useState('');
  const provider = tonConnect();
  useEffect(() => { if (authStatus === 'authenticated') void fetchTransactions().then(setTransactions); }, [authStatus, setTransactions]);
  const connect = async () => { try { const result = await provider.connect(); setConnection(result.address); } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed'); } };
  return <main className="page commerce-page"><Link className="brand" to="/">Lumos</Link><header className="commerce-header"><div><h1>Wallet</h1><p>TON and USDT payment status</p></div><span className={`wallet-dot ${wallet.connected ? 'connected' : ''}`} /></header><section className="wallet-card"><h2>{wallet.connected ? 'Wallet connected' : 'Connect TON wallet'}</h2><p>{wallet.address || 'A verified provider and public tonconnect manifest are required.'}</p><button className="button primary" disabled={!provider.available || authStatus !== 'authenticated'} onClick={() => void connect()}>{provider.available ? 'Connect TON' : 'TON Connect not configured'}</button>{message && <p>{message}</p>}</section><section className="purchase-history"><h2>Transactions</h2>{wallet.transactions.length === 0 ? <p>No TON or USDT transactions.</p> : wallet.transactions.map((transaction) => <article className="transaction-row" key={transaction.transactionId}><span>{transaction.asset} · {transaction.amount}</span><strong className={`payment-${transaction.status}`}>{transaction.status}</strong><small>+{transaction.creditedCoins} MTX</small></article>)}</section></main>;
}
