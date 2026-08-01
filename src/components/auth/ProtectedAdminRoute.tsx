import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
export function ProtectedAdminRoute() { const isAdmin = useAppStore((state) => state.user.isAdmin); return isAdmin ? <Outlet /> : <Navigate to="/" replace />; }
