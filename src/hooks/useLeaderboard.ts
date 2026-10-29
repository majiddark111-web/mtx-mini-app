import { useEffect, useState } from 'react';
import { getApiAuthToken } from '../api/httpClient';
import { fetchLeaderboard, type Leader, type LeaderboardScope } from '../services/socialService';
import { parseLeaders } from '../services/readModels';
import { useAppStore } from '../store/useAppStore';

interface BoardState { userId: string; scope: LeaderboardScope; entries: Leader[]; loading: boolean; error: boolean; live: boolean; }

export function useLeaderboard(scope: LeaderboardScope) {
  const auth = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<BoardState>({ userId: '', scope, entries: [], loading: true, error: false, live: false });
  useEffect(() => {
    let active = true, inFlight = false, socketRevision = 0, lastMessage = 0;
    let socket: WebSocket | undefined;
    const current = () => active && useAppStore.getState().authStatus === 'authenticated' && useAppStore.getState().user.id === userId;
    const empty = { userId, scope, entries: [], loading: true, error: false, live: false };
    setState(empty);
    if (auth !== 'authenticated' || !userId) return () => { active = false; };
    const load = async () => {
      if (!current() || inFlight) return;
      inFlight = true;
      const beforeSocket = socketRevision;
      try {
        const entries = await fetchLeaderboard(scope);
        if (current() && beforeSocket === socketRevision) setState({ ...empty, entries, loading: false });
      } catch {
        if (current() && beforeSocket === socketRevision) setState({ ...empty, loading: false, error: true });
      } finally { inFlight = false; }
    };
    void load();
    const url = import.meta.env.VITE_LEADERBOARD_WS as string | undefined;
    if (scope === 'global' && url) {
      try {
        socket = new WebSocket(url);
        socket.addEventListener('open', () => {
          if (!current()) return;
          try { socket?.send(JSON.stringify({ type: 'auth', token: getApiAuthToken() })); }
          catch { lastMessage = 0; socket?.close(); }
        });
        socket.addEventListener('message', (event) => {
          if (!current()) return;
          try {
            const payload: unknown = JSON.parse(String(event.data));
            if (!payload || typeof payload !== 'object' || !('type' in payload) || payload.type !== 'leaderboard') return;
            const entries = parseLeaders('entries' in payload ? payload.entries : undefined);
            socketRevision++;
            lastMessage = Date.now();
            setState({ ...empty, entries, loading: false, live: true });
          } catch {
            lastMessage = 0;
            setState((previous) => ({ ...previous, live: false }));
            socket?.close();
          }
        });
        const disconnected = () => {
          lastMessage = 0;
          if (current()) setState((previous) => ({ ...previous, live: false }));
        };
        socket.addEventListener('close', disconnected);
        socket.addEventListener('error', disconnected);
      } catch { /* HTTP polling remains available if the socket cannot be created. */ }
    }
    // A connected but silent socket must not suppress HTTP refresh indefinitely.
    const timer = window.setInterval(() => {
      if (!lastMessage || Date.now() - lastMessage >= 10_000) {
        if (current()) setState((previous) => ({ ...previous, live: false }));
        void load();
      }
    }, 5_000);
    return () => { active = false; window.clearInterval(timer); socket?.close(); };
  }, [auth, userId, scope, revision]);
  const visible = auth === 'authenticated' && state.userId === userId && state.scope === scope;
  return { auth, userId, entries: visible ? state.entries : [], live: visible && state.live,
    loading: auth === 'authenticated' && (!visible || state.loading), error: visible && state.error,
    retry: () => setRevision((value) => value + 1) };
}
