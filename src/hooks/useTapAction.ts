import { useCallback, useEffect, useRef } from 'react';
import { syncTapBatch } from '../services/gameApiService';
import { hapticTap } from '../services/telegramService';
import { acknowledgeTapBatch, appendTap, nextTapBatch, sealActiveBatch, tapBatchDuration } from '../services/tapOutboxService';
import { useAppStore } from '../store/useAppStore';

const SYNC_INTERVAL_MS = 2_000;
export function useTapAction(): () => void {
  const tap = useAppStore((state) => state.tap);
  const authStatus = useAppStore((state) => state.authStatus);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  const userId = useAppStore((state) => state.user.id);
  const syncing = useRef(false);

  const flush = useCallback(async () => {
    if (authStatus !== 'authenticated' || !userId || syncing.current) return;
    sealActiveBatch(localStorage, userId);
    const batch = nextTapBatch(localStorage, userId);
    if (!batch) return;
    syncing.current = true;
    let acknowledged = false;
    try { setServerGameState(await syncTapBatch(batch.taps, tapBatchDuration(batch), batch.batchId)); acknowledgeTapBatch(localStorage, userId, batch.batchId); acknowledged = true; }
    catch { /* The exact batch remains durable and is retried with the same id. */ }
    finally { syncing.current = false; if (acknowledged && nextTapBatch(localStorage, userId)) void flush(); }
  }, [authStatus, setServerGameState, userId]);

  useEffect(() => {
    const timer = window.setInterval(() => void flush(), SYNC_INTERVAL_MS);
    const retry = () => void flush();
    const lifecycleFlush = () => { if (userId) sealActiveBatch(localStorage, userId); void flush(); };
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', lifecycleFlush);
    document.addEventListener('visibilitychange', lifecycleFlush);
    void flush();
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); window.removeEventListener('pagehide', lifecycleFlush); document.removeEventListener('visibilitychange', lifecycleFlush); lifecycleFlush(); };
  }, [flush, userId]);

  return useCallback(() => {
    hapticTap();
    if (authStatus === 'authenticated') {
      if (!userId) return;
      const batch = appendTap(localStorage, userId);
      tap();
      if (batch.sealed) void flush();
      return;
    }
    tap();
  }, [authStatus, flush, tap, userId]);
}
