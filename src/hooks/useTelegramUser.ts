import { useEffect } from 'react';
import { authenticateTelegram } from '../services/authService';
import { acceptReferral } from '../services/socialService';
import { getTelegramInitData, getTelegramStartParameter, getTelegramUser, initializeTelegram, waitForTelegramApp } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';

async function deviceFingerprint(): Promise<string> {
  const data = new TextEncoder().encode(`${navigator.userAgent}:${window.screen.width}x${window.screen.height}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function useTelegramUser(): void {
  const setUser = useAppStore((state) => state.setUser);
  const setAuthStatus = useAppStore((state) => state.setAuthStatus);
  useEffect(() => {
    let active = true; let connecting = false; let cleanup: () => void = () => undefined;
    const connect = async () => {
      if (!active || connecting || useAppStore.getState().authStatus === 'authenticated') return;
      connecting = true; setAuthStatus('loading');
      try {
        await waitForTelegramApp();
        if (!active) return;
        cleanup(); cleanup = initializeTelegram();
        const user = getTelegramUser();
        if (user) setUser({ id: String(user.id), username: user.username || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'user', avatar: user.photo_url || '' });
        const initData = getTelegramInitData();
        if (!initData) { setAuthStatus('error'); return; }
        const profile = await authenticateTelegram(initData);
        if (!active) return;
        setUser({ id: profile.id, username: profile.username || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'user', avatar: profile.photoUrl || '' });
        setAuthStatus('authenticated');
        const referralCode = getTelegramStartParameter(initData);
        if (referralCode) {
          try { await acceptReferral(referralCode, await deviceFingerprint()); }
          catch { /* A used, self-owned or device-reused referral must not break authentication. */ }
        }
      } catch { if (active) setAuthStatus('error'); }
      finally { connecting = false; }
    };
    const retryWhenVisible = () => { if (document.visibilityState === 'visible' && useAppStore.getState().authStatus === 'error') void connect(); };
    document.addEventListener('visibilitychange', retryWhenVisible);
    void connect();
    return () => { active = false; document.removeEventListener('visibilitychange', retryWhenVisible); cleanup(); };
  }, [setAuthStatus, setUser]);
}
