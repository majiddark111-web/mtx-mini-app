import { useEffect } from 'react';
import { authenticateTelegram } from '../services/authService';
import { getTelegramInitData, getTelegramUser, initializeTelegram, waitForTelegramApp } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';

export function useTelegramUser(): void {
  const setUser = useAppStore((state) => state.setUser);
  const setAuthStatus = useAppStore((state) => state.setAuthStatus);
  useEffect(() => {
    let active = true; let cleanup: () => void = () => undefined;
    const connect = async () => { await waitForTelegramApp(); if (!active) return; cleanup = initializeTelegram(); const user = getTelegramUser(); if (user) setUser({ id: String(user.id), username: user.username || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'user', avatar: user.photo_url || '' }); const initData = getTelegramInitData(); if (initData) { setAuthStatus('loading'); authenticateTelegram(initData).then((profile) => { if (!active) return; setUser({ id: profile.id, username: profile.username || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'user', avatar: profile.photoUrl || '' }); setAuthStatus('authenticated'); }).catch(() => { if (active) setAuthStatus('error'); }); } };
    void connect();
    return () => { active = false; cleanup(); };
  }, [setAuthStatus, setUser]);
}
