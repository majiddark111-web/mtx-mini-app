import { createBrowserRouter } from 'react-router-dom';
import { ProtectedAdminRoute } from '../components/auth/ProtectedAdminRoute';
import { AppLayout } from '../layouts/AppLayout';
import { GamePage } from '../pages/GamePage';
import { HomePage } from '../pages/HomePage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { StorePage } from '../pages/StorePage';
import { InventoryPage } from '../pages/InventoryPage';
import { WalletPage } from '../pages/WalletPage';
import { MissionsPage } from '../pages/MissionsPage';
import { DailyRewardPage } from '../pages/DailyRewardPage';
import { LeaderboardPage } from '../pages/LeaderboardPage';
import { ReferralPage } from '../pages/ReferralPage';
import { ProfilePage } from '../pages/ProfilePage';

const placeholder = (title: string, description: string) => <PlaceholderPage title={title} description={description} />;
export const router = createBrowserRouter([{ element: <AppLayout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/game', element: <GamePage /> },
  { path: '/store', element: <StorePage /> },
  { path: '/inventory', element: <InventoryPage /> },
  { path: '/wallet', element: <WalletPage /> },
  { path: '/missions', element: <MissionsPage /> },
  { path: '/daily-reward', element: <DailyRewardPage /> },
  { path: '/leaderboard', element: <LeaderboardPage /> },
  { path: '/referral', element: <ReferralPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/settings', element: placeholder('Settings', 'Theme, sound and language controls will appear here.') },
  { path: '/notifications', element: placeholder('Notifications', 'Game announcements and reward updates will appear here.') },
  { path: '/history', element: placeholder('History', 'Reward, upgrade and transaction history will appear here.') },
  { element: <ProtectedAdminRoute />, children: [{ path: '/admin', element: placeholder('Admin', 'This hidden route requires the admin role.') }] },
  { path: '*', element: placeholder('Not Found', 'This Lumos page does not exist.') },
]}]);
