import { Outlet, useLocation } from 'react-router-dom';
import { useGamePersistence } from '../hooks/useGamePersistence';
import { useTelegramUser } from '../hooks/useTelegramUser';
import { useTelegramNavigation } from '../hooks/useTelegramNavigation';
import { BottomNavigation } from '../components/navigation/BottomNavigation';

export function AppLayout() {
  useTelegramUser(); useTelegramNavigation(); useGamePersistence();
  const location = useLocation();
  return <div className="app-shell"><Outlet />{location.pathname !== '/game' && <BottomNavigation />}</div>;
}
