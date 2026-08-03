export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: TelegramUser; start_param?: string };
  themeParams?: Record<string, string>;
  colorScheme?: 'light' | 'dark';
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string) => void;
  onEvent?: (event: string, listener: () => void) => void;
  offEvent?: (event: string, listener: () => void) => void;
  HapticFeedback?: { impactOccurred: (style: 'light' | 'medium' | 'heavy') => void };
  CloudStorage?: { setItem: (key: string, value: string, callback?: (error: unknown, stored?: boolean) => void) => void };
  BackButton?: { show: () => void; hide: () => void; onClick: (listener: () => void) => void; offClick: (listener: () => void) => void };
  MainButton?: { setText: (text: string) => void; show: () => void; hide: () => void; onClick: (listener: () => void) => void; offClick: (listener: () => void) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
