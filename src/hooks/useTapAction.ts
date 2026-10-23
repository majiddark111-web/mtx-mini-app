import { useCallback, useEffect, useRef } from 'react';
import { syncTapBatch } from '../services/gameApiService';
import { withPendingTaps } from '../services/gameService';
import { hapticTap } from '../services/telegramService';
import { playTapSound } from '../services/preferencesService';
import { acknowledgeTapBatch, appendTap, nextTapBatch, pendingTapCount, sealActiveBatch, tapBatchDuration } from '../services/tapOutboxService';
import { runTapSync } from '../services/tapSyncCoordinator';
import { useAppStore } from '../store/useAppStore';
import { getApiSessionDiagnostic, hasUsablePlayerSession } from '../api/httpClient';
import { attemptPlayerTap } from '../services/playerTapAction';
import { gameDiagnostics } from '../services/playerDiagnostics';

const SYNC_INTERVAL_MS = 2_000;
export function useTapAction(): () => void {
  const tap = useAppStore((state) => state.tap);
  const authStatus = useAppStore((state) => state.authStatus);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  const userId = useAppStore((state) => state.user.id);
  const syncing = useRef(false);

  const flush = useCallback(async () => {
    if (useAppStore.getState().authStatus !== 'authenticated' || !userId || syncing.current) return;
    sealActiveBatch(localStorage, userId);
    const batch = nextTapBatch(localStorage, userId);
    if (!batch) return;
    syncing.current = true;
    let acknowledged = false;
    try { const state = await runTapSync(() => syncTapBatch(batch.taps, tapBatchDuration(batch), batch.batchId)); acknowledgeTapBatch(localStorage, userId, batch.batchId); setServerGameState(withPendingTaps(state, pendingTapCount(localStorage, userId))); acknowledged = true; }
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
    const current = useAppStore.getState();
    const attemptedAt = Date.now();
    const credential = getApiSessionDiagnostic(attemptedAt).status;
    const result = attemptPlayerTap(current.authStatus, current.user.id, {
      hasUsableSession: hasUsablePlayerSession,
      queueTap: (account) => appendTap(localStorage, account),
      applyTap: tap,
    });
    gameDiagnostics.recordLocalTap(current.user.id, result.accepted, current.authStatus, credential, attemptedAt);
    if (!result.accepted) return;
    hapticTap();
    playTapSound();
    if (result.sealed) void flush();
  }, [authStatus, flush, tap, userId]);
}
