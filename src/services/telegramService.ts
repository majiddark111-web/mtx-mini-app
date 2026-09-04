import type { TelegramUser, TelegramWebApp } from '../types/telegram';
import { getPreferences } from './preferencesService.ts';

export function getTelegramApp(): TelegramWebApp | undefined { return window.Telegram?.WebApp; }
export function getTelegramUser(): TelegramUser | undefined { return getTelegramApp()?.initDataUnsafe?.user; }
export function getTelegramInitData(): string { return getTelegramApp()?.initData ?? ''; }
export function getTelegramStartParameter(initData = getTelegramInitData()): string {
  const value = new URLSearchParams(initData).get('start_param') ?? '';
  return /^MTX-[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '';
}
export async function waitForTelegramApp(timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!getTelegramApp() && Date.now() - startedAt < timeoutMs) await new Promise((resolve) => window.setTimeout(resolve, 50));
}
function applyTheme(): void {
  const app = getTelegramApp();
  document.documentElement.dataset.telegramTheme = app?.colorScheme ?? 'dark';
  for (const [name, value] of Object.entries(app?.themeParams ?? {})) document.documentElement.style.setProperty(`--tg-${name.replace(/_/g, '-')}`, value);
}
export function initializeTelegram(): () => void {
  const app = getTelegramApp();
  app?.ready?.(); app?.expand?.(); applyTheme();
  app?.onEvent?.('themeChanged', applyTheme);
  app?.CloudStorage?.setItem('mtx_last_seen', String(Date.now()));
  return () => app?.offEvent?.('themeChanged', applyTheme);
}
export function openExternalLink(url: string): void {
  const app = getTelegramApp();
  if (app?.openLink) app.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function hapticTap(): void { if (!getPreferences().haptics) return; const feedback = getTelegramApp()?.HapticFeedback; if (feedback) feedback.impactOccurred('light'); else if ('vibrate' in navigator) navigator.vibrate(10); }

export function telegramStartAppLink(startParameter?: string): string {
  const configured = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'TOKXTAPBOT').replace(/^@/, '');
  const username = /^[A-Za-z0-9_]{5,32}$/.test(configured) ? configured : 'TOKXTAPBOT';
  const url = new URL(`https://t.me/${username}`);
  if (startParameter) url.searchParams.set('startapp', startParameter);
  return url.toString();
}
