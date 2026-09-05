import { NavLink } from 'react-router-dom';
import { useI18n } from '../../hooks/useI18n';
const links = [{ to: '/', icon: '🏠', en: 'Home', fa: 'خانه' }, { to: '/game', icon: '⚡', en: 'Game', fa: 'بازی' }, { to: '/inventory', icon: '🎒', en: 'Inventory', fa: 'دارایی' }, { to: '/missions', icon: '🎯', en: 'Missions', fa: 'مأموریت' }, { to: '/wallet', icon: '👛', en: 'Wallet', fa: 'کیف پول' }, { to: '/profile', icon: '👤', en: 'Profile', fa: 'پروفایل' }];
export function BottomNavigation() { const { text } = useI18n(); return <nav className="bottom-nav" aria-label={text('Primary navigation', 'پیمایش اصلی')}>{links.map((link) => <NavLink key={link.to} to={link.to} end={link.to === '/'}><span>{link.icon}</span><small>{text(link.en, link.fa)}</small></NavLink>)}</nav>; }
