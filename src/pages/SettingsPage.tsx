import { Link } from 'react-router-dom';
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences, type AppPreferences, type ThemePreference } from '../services/preferencesService';

function Toggle({ icon, title, description, setting, value }: { icon: string; title: string; description: string; setting: keyof Pick<AppPreferences, 'sound' | 'haptics' | 'lowPower'>; value: boolean }) {
  return <label className="settings-row"><span className="settings-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={value} onChange={(event) => updatePreferences({ [setting]: event.target.checked })} /><i aria-hidden="true" /></label>;
}

export function SettingsPage() {
  const preferences = usePreferences();
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>Settings</h1><p>Saved automatically on this device</p></div></header><section className="settings-card"><h2>Appearance</h2><div className="theme-options" role="radiogroup" aria-label="Color theme">{(['system', 'dark', 'light'] as ThemePreference[]).map((theme) => <button className={preferences.theme === theme ? 'active' : ''} role="radio" aria-checked={preferences.theme === theme} type="button" key={theme} onClick={() => updatePreferences({ theme })}><span>{theme === 'system' ? '📱' : theme === 'dark' ? '🌙' : '☀️'}</span>{theme}</button>)}</div></section><section className="settings-card"><h2>Game feedback</h2><Toggle icon="🔊" title="Tap sound" description="Play a short sound for each tap" setting="sound" value={preferences.sound} /><Toggle icon="📳" title="Vibration" description="Telegram haptic feedback while tapping" setting="haptics" value={preferences.haptics} /><Toggle icon="🔋" title="Low-power mode" description="Reduce motion, glow and background effects" setting="lowPower" value={preferences.lowPower} /></section><section className="settings-note"><strong>Language</strong><p>The interface currently has one complete language: English. A Persian switch is intentionally not shown until every page has a reliable translation.</p></section></main>;
}
