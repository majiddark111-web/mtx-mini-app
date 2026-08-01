import { useEffect } from 'react';
import { getTelegramUser, initializeTelegram } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';

export function useTelegramUser(): void {
  const setUser = useAppStore((state) => state.setUser);
  useEffect(() => {
    initializeTelegram();
    const user = getTelegramUser();
    if (user) setUser({ id: String(user.id), username: user.username || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'user', avatar: user.photo_url || '' });
  }, [setUser]);
}
