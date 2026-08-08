import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
export function ProtectedAdminRoute() { const isAdmin = useAppStore((state) => state.adminAuthenticated); return isAdmin ? <Outlet /> : <Navigate to="/admin/login" replace />; }
