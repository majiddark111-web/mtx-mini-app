import { Outlet, useLocation } from 'react-router-dom';
import { useGamePersistence } from '../hooks/useGamePersistence';
import { useGameSync } from '../hooks/useGameSync';
import { useTelegramUser } from '../hooks/useTelegramUser';
import { useTelegramNavigation } from '../hooks/useTelegramNavigation';
import { useInventorySync } from '../hooks/useInventorySync';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useEffect } from 'react';
import { initializePreferences } from '../services/preferencesService';
import { NotificationBell } from '../components/notifications/NotificationBell';

export function AppLayout() {
  useEffect(() => initializePreferences(), []);
  useTelegramUser(); useTelegramNavigation(); useGamePersistence(); useGameSync(); useInventorySync();
  const location = useLocation();
  return <div className="app-shell"><Outlet />{location.pathname !== '/game' && !location.pathname.startsWith('/admin') && <><NotificationBell /><BottomNavigation /></>}</div>;
}
