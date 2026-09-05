export type ThemePreference = 'system' | 'dark' | 'light';
export type LanguagePreference = 'en' | 'fa';
export interface AppPreferences { theme: ThemePreference; language: LanguagePreference; sound: boolean; haptics: boolean; lowPower: boolean; }

const STORAGE_KEY = 'mtx.preferences.v1';
const DEFAULTS: AppPreferences = { theme: 'system', language: 'en', sound: true, haptics: true, lowPower: false };
const listeners = new Set<() => void>();
let cached: AppPreferences | undefined;
let tapAudioContext: AudioContext | undefined;

function valid(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') return DEFAULTS;
  const input = value as Partial<AppPreferences>;
  const theme = input.theme === 'light' || input.theme === 'dark' || input.theme === 'system' ? input.theme : DEFAULTS.theme;
  const language = input.language === 'fa' || input.language === 'en' ? input.language : DEFAULTS.language;
  return { theme, language, sound: typeof input.sound === 'boolean' ? input.sound : DEFAULTS.sound, haptics: typeof input.haptics === 'boolean' ? input.haptics : DEFAULTS.haptics, lowPower: typeof input.lowPower === 'boolean' ? input.lowPower : DEFAULTS.lowPower };
}

export function loadPreferences(storage: Pick<Storage, 'getItem'> = localStorage): AppPreferences {
  try { return valid(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')); } catch { return DEFAULTS; }
}

export function getPreferences(): AppPreferences { return cached ??= loadPreferences(); }

export function applyPreferences(preferences = getPreferences()): void {
  document.documentElement.dataset.appTheme = preferences.theme;
  document.documentElement.dataset.lowPower = String(preferences.lowPower);
  document.documentElement.lang = preferences.language;
  document.documentElement.dir = preferences.language === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.style.colorScheme = preferences.theme === 'system' ? 'dark light' : preferences.theme;
}

export function updatePreferences(patch: Partial<AppPreferences>): AppPreferences {
  cached = valid({ ...getPreferences(), ...patch });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch { /* Preferences remain active for this session. */ }
  applyPreferences(cached);
  listeners.forEach((listener) => listener());
  return cached;
}

export function subscribePreferences(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }

export function initializePreferences(): () => void {
  applyPreferences();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => { if (getPreferences().theme === 'system') applyPreferences(); };
  media.addEventListener('change', refresh);
  return () => media.removeEventListener('change', refresh);
}

export function playTapSound(): void {
  if (!getPreferences().sound) return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = tapAudioContext ??= new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(520, context.currentTime);
  gain.gain.setValueAtTime(0.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.045);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.05);
}
