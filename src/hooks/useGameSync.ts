import { useEffect } from 'react';
import { fetchGameState } from '../services/gameApiService';
import { withPendingTaps } from '../services/gameService';
import { pendingTapCount } from '../services/tapOutboxService';
import { useAppStore } from '../store/useAppStore';

export function useGameSync(): void {
  const authStatus = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    fetchGameState().then(({ state }) => { if (active) setServerGameState(withPendingTaps(state, pendingTapCount(localStorage, userId))); }).catch(() => undefined);
    return () => { active = false; };
  }, [authStatus, setServerGameState, userId]);
}
