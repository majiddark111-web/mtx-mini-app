import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedAdminRoute } from '../components/auth/ProtectedAdminRoute';
import { AppLayout } from '../layouts/AppLayout';
import { PlaceholderPage } from '../pages/PlaceholderPage';

const HomePage = lazy(() => import('../pages/HomePage').then(({ HomePage }) => ({ default: HomePage })));
const GamePage = lazy(() => import('../pages/GamePage').then(({ GamePage }) => ({ default: GamePage })));
const StorePage = lazy(() => import('../pages/StorePage').then(({ StorePage }) => ({ default: StorePage })));
const InventoryPage = lazy(() => import('../pages/InventoryPage').then(({ InventoryPage }) => ({ default: InventoryPage })));
const WalletPage = lazy(() => import('../pages/WalletPage').then(({ WalletPage }) => ({ default: WalletPage })));
const MissionsPage = lazy(() => import('../pages/MissionsPage').then(({ MissionsPage }) => ({ default: MissionsPage })));
const DailyRewardPage = lazy(() => import('../pages/DailyRewardPage').then(({ DailyRewardPage }) => ({ default: DailyRewardPage })));
const LeaderboardPage = lazy(() => import('../pages/LeaderboardPage').then(({ LeaderboardPage }) => ({ default: LeaderboardPage })));
const ReferralPage = lazy(() => import('../pages/ReferralPage').then(({ ReferralPage }) => ({ default: ReferralPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then(({ ProfilePage }) => ({ default: ProfilePage })));
const AdminLoginPage = lazy(() => import('../pages/AdminLoginPage').then(({ AdminLoginPage }) => ({ default: AdminLoginPage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then(({ AdminPage }) => ({ default: AdminPage })));

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
  { path: '/admin/login', element: <AdminLoginPage /> },
  { element: <ProtectedAdminRoute />, children: [{ path: '/admin', element: <AdminPage /> }] },
  { path: '*', element: placeholder('Not Found', 'This MTX page does not exist.') },
]}]);
