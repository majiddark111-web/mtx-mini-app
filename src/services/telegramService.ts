import type { TelegramUser, TelegramWebApp } from '../types/telegram';

export function getTelegramApp(): TelegramWebApp | undefined { return window.Telegram?.WebApp; }
export function getTelegramUser(): TelegramUser | undefined { return getTelegramApp()?.initDataUnsafe?.user; }
export function initializeTelegram(): void { const app = getTelegramApp(); app?.ready?.(); app?.expand?.(); }
export function openExternalLink(url: string): void {
  const app = getTelegramApp();
  if (app?.openLink) app.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function hapticTap(): void { if ('vibrate' in navigator) navigator.vibrate(10); }
