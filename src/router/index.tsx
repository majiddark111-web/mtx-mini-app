import { createBrowserRouter } from 'react-router-dom';
import { ProtectedAdminRoute } from '../components/auth/ProtectedAdminRoute';
import { AppLayout } from '../layouts/AppLayout';
import { GamePage } from '../pages/GamePage';
import { HomePage } from '../pages/HomePage';
import { PlaceholderPage } from '../pages/PlaceholderPage';

const placeholder = (title: string, description: string) => <PlaceholderPage title={title} description={description} />;
export const router = createBrowserRouter([{ element: <AppLayout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/game', element: <GamePage /> },
  { path: '/store', element: placeholder('Store', 'Items and upgrades will use the approved economy configuration.') },
  { path: '/inventory', element: placeholder('Inventory', 'Owned boosts, skins and consumables will appear here.') },
  { path: '/wallet', element: placeholder('Wallet', 'TON wallet connection will be implemented after secure authentication.') },
  { path: '/missions', element: placeholder('Missions', 'Daily and community missions will be verified by the backend.') },
  { path: '/daily-reward', element: placeholder('Daily Reward', 'Daily streaks and claims will live here.') },
  { path: '/leaderboard', element: placeholder('Leaderboard', 'Global and seasonal rankings will appear here.') },
  { path: '/referral', element: placeholder('Referral', 'Invite tracking and verified rewards will appear here.') },
  { path: '/profile', element: placeholder('Profile', 'Player stats, badges and achievements will appear here.') },
  { path: '/settings', element: placeholder('Settings', 'Theme, sound and language controls will appear here.') },
  { path: '/notifications', element: placeholder('Notifications', 'Game announcements and reward updates will appear here.') },
  { path: '/history', element: placeholder('History', 'Reward, upgrade and transaction history will appear here.') },
  { element: <ProtectedAdminRoute />, children: [{ path: '/admin', element: placeholder('Admin', 'This hidden route requires the admin role.') }] },
  { path: '*', element: placeholder('Not Found', 'This Lumos page does not exist.') },
]}]);
