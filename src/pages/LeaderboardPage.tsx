import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiAuthToken } from '../api/httpClient';
import { VirtualList } from '../components/common/VirtualList';
import { fetchLeaderboard, type Leader } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';

export function LeaderboardPage() {
  const auth = useAppStore((state) => state.authStatus); const [entries, setEntries] = useState<Leader[]>([]); const [live, setLive] = useState(false);
  useEffect(() => { if (auth !== 'authenticated') return; const load = () => void fetchLeaderboard().then(setEntries); let connected = false; load(); const url = import.meta.env.VITE_LEADERBOARD_WS as string | undefined; let socket: WebSocket | undefined; if (url) { socket = new WebSocket(url); socket.addEventListener('open', () => { connected = true; socket?.send(JSON.stringify({ type: 'auth', token: getApiAuthToken() })); setLive(true); }); socket.addEventListener('message', (event) => { const payload = JSON.parse(String(event.data)) as { type?: string; entries?: Leader[] }; if (payload.type === 'leaderboard' && payload.entries) setEntries(payload.entries); }); socket.addEventListener('close', () => { connected = false; setLive(false); }); } const timer = window.setInterval(() => { if (!connected) load(); }, 5_000); return () => { window.clearInterval(timer); socket?.close(); }; }, [auth]);
  return <main className="page commerce-page"><Link className="brand" to="/">Lumos</Link><header className="commerce-header"><div><h1>Leaderboard</h1><p>{live ? 'Live WebSocket updates' : 'Polling fallback · every 5 seconds'}</p></div></header><VirtualList className="leaderboard" items={entries} itemHeight={54} height={560} keyFor={(entry) => entry.userId} renderItem={(entry) => <div className="leaderboard-entry"><b>#{entry.rank}</b><span>{entry.username}</span><strong>{entry.coins.toLocaleString()} MTX</strong></div>} /></main>;
}
