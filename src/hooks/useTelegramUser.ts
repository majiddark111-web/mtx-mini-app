import { useEffect } from 'react';
import { authenticateTelegram } from '../services/authService';
import { acceptReferral } from '../services/socialService';
import { getTelegramInitData, getTelegramStartParameter, getTelegramUser, initializeTelegram, waitForTelegramApp } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';
import { maintainPlayerSession, PLAYER_SESSION_EXPIRED } from '../api/httpClient';
import { sealActiveBatch } from '../services/tapOutboxService';

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
    const expired = () => {
      if (!active) return;
      const userId = useAppStore.getState().user.id;
      setAuthStatus('expired');
      // Never clear the outbox: the next Telegram launch retries the same batch IDs.
      if (userId) sealActiveBatch(localStorage, userId);
    };
    const maintain = () => { if (document.visibilityState === 'visible') void maintainPlayerSession().catch(() => undefined); };
    window.addEventListener(PLAYER_SESSION_EXPIRED, expired);
    window.addEventListener('online', maintain);
    const timer = window.setInterval(maintain, 15_000);
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
        if (!initData) {
          // Outside Telegram, keep the explicit demo; never downgrade a known account.
          setAuthStatus(!user && !useAppStore.getState().user.id ? 'demo' : 'error');
          return;
        }
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
    const retryWhenVisible = () => {
      maintain();
      if (document.visibilityState === 'visible' && useAppStore.getState().authStatus === 'error') void connect();
    };
    document.addEventListener('visibilitychange', retryWhenVisible);
    void connect();
    return () => { active = false; window.clearInterval(timer); window.removeEventListener(PLAYER_SESSION_EXPIRED, expired); window.removeEventListener('online', maintain); document.removeEventListener('visibilitychange', retryWhenVisible); cleanup(); };
  }, [setAuthStatus, setUser]);
}
