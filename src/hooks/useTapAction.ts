import { useCallback, useEffect, useRef } from 'react';
import { fetchGameState, syncTapBatch } from '../services/gameApiService';
import { hapticTap } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';

const SYNC_INTERVAL_MS = 2_000;
const MAX_BATCH_SIZE = 50;

export function useTapAction(): () => void {
  const tap = useAppStore((state) => state.tap);
  const authStatus = useAppStore((state) => state.authStatus);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  const pending = useRef(0);
  const startedAt = useRef(performance.now());
  const syncing = useRef(false);

  const flush = useCallback(async () => {
    if (authStatus !== 'authenticated' || syncing.current || pending.current === 0) return;
    syncing.current = true;
    const taps = Math.min(MAX_BATCH_SIZE, pending.current);
    pending.current -= taps;
    const durationMs = Math.max(100, Math.round(performance.now() - startedAt.current));
    startedAt.current = performance.now();
    try { setServerGameState(await syncTapBatch(taps, Math.min(10_000, durationMs), crypto.randomUUID())); }
    catch { try { setServerGameState((await fetchGameState()).state); } catch { pending.current += taps; } }
    finally { syncing.current = false; if (pending.current > 0) void flush(); }
  }, [authStatus, setServerGameState]);

  useEffect(() => {
    const timer = window.setInterval(() => void flush(), SYNC_INTERVAL_MS);
    return () => { window.clearInterval(timer); void flush(); };
  }, [flush]);

  return useCallback(() => {
    hapticTap();
    tap();
    if (authStatus === 'authenticated') {
      if (pending.current === 0) startedAt.current = performance.now();
      pending.current += 1;
      if (pending.current >= MAX_BATCH_SIZE) void flush();
    }
  }, [authStatus, flush, tap]);
}
