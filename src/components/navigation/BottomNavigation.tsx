import { NavLink } from 'react-router-dom';
const links = [{ to: '/', icon: '🏠', label: 'Home' }, { to: '/game', icon: '⚡', label: 'Game' }, { to: '/inventory', icon: '🎒', label: 'Inventory' }, { to: '/missions', icon: '🎯', label: 'Missions' }, { to: '/wallet', icon: '👛', label: 'Wallet' }, { to: '/profile', icon: '👤', label: 'Profile' }];
export function BottomNavigation() { return <nav className="bottom-nav" aria-label="Primary">{links.map((link) => <NavLink key={link.to} to={link.to} end={link.to === '/'}><span>{link.icon}</span><small>{link.label}</small></NavLink>)}</nav>; }
