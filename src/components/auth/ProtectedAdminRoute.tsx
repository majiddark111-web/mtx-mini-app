import { Navigate, Outlet } from 'react-router-dom';
import { hasAdminSession } from '../../services/adminService';
import { useAppStore } from '../../store/useAppStore';
export function ProtectedAdminRoute() { const isAdmin = useAppStore((state) => state.adminAuthenticated); return isAdmin || hasAdminSession() ? <Outlet /> : <Navigate to="/admin/login" replace />; }
