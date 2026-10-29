import { useEffect, useRef, useState } from 'react';
import { getApiSessionSubject, hasUsablePlayerSession } from '../api/httpClient';
import { activateInventoryItem, fetchInventory, selectInventorySkin, type ActivatableInventoryItem, type EquippedSkin } from '../services/commerceService';
import { syncTapBatch } from '../services/gameApiService';
import { acknowledgeTapBatch, nextTapBatch, sealActiveBatch, tapBatchDuration } from '../services/tapOutboxService';
import { runTapSync, waitForTapSyncIdle } from '../services/tapSyncCoordinator';
import { useAppStore } from '../store/useAppStore';
import { useRewardRequest } from './useRewardRequest';

export function useInventoryActions() {
  const request = useRewardRequest(fetchInventory);
  const userId = useAppStore((state) => state.user.id);
  const [success, setSuccess] = useState('');
  const scope = useRef({ active: false, userId });

  useEffect(() => {
    const value = { active: true, userId };
    scope.current = value;
    setSuccess('');
    return () => { value.active = false; };
  }, [userId, request.auth]);

  useEffect(() => {
    if (request.data && request.auth === 'authenticated' && getApiSessionSubject() === userId) {
      const { items, purchases, equippedSkin } = request.data;
      useAppStore.getState().setInventory(items, purchases, equippedSkin);
    }
  }, [request.data, request.auth, userId]);

  const run = async (name: string, operation: (guard: () => void) => Promise<void>) => {
    const value = scope.current;
    const guard = () => {
      const state = useAppStore.getState();
      if (!value.active || scope.current !== value || state.user.id !== value.userId ||
          state.authStatus !== 'authenticated' || getApiSessionSubject() !== value.userId || !hasUsablePlayerSession()) {
        throw new Error('Telegram session required');
      }
    };
    const accepted = await request.run(name, async () => {
      guard();
      setSuccess('');
      await operation(guard);
      guard();
    });
    if (accepted && value.active && scope.current === value) setSuccess(name);
  };

  const activate = (itemId: ActivatableInventoryItem) => run(itemId, async (guard) => {
    await waitForTapSyncIdle();
    guard();
    sealActiveBatch(localStorage, userId);
    let batch = nextTapBatch(localStorage, userId);
    while (batch) {
      const pending = batch;
      const state = await runTapSync(() => {
        guard();
        return syncTapBatch(pending.taps, tapBatchDuration(pending), pending.batchId);
      });
      guard();
      acknowledgeTapBatch(localStorage, userId, pending.batchId);
      useAppStore.getState().setServerGameState(state);
      batch = nextTapBatch(localStorage, userId);
    }
    guard();
    const result = await activateInventoryItem(itemId);
    guard();
    useAppStore.getState().setServerGameState(result.state);
    // Inventory is re-read by the controller, including after an uncertain result.
  });

  const chooseSkin = (skinId: EquippedSkin) => run(skinId ?? 'default', async (guard) => {
    const selected = await selectInventorySkin(skinId);
    guard();
    useAppStore.getState().setEquippedSkin(selected);
  });

  return { ...request, success: request.ready ? success : '', activate, chooseSkin };
}
