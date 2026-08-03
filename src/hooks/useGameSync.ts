import { useEffect } from 'react';
import { fetchGameState } from '../services/gameApiService';
import { useAppStore } from '../store/useAppStore';

export function useGameSync(): void {
  const authStatus = useAppStore((state) => state.authStatus);
  const setServerGameState = useAppStore((state) => state.setServerGameState);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    fetchGameState().then(({ state }) => { if (active) setServerGameState(state); }).catch(() => undefined);
    return () => { active = false; };
  }, [authStatus, setServerGameState]);
}

