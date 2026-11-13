import { NavLink } from 'react-router-dom';
import { useI18n } from '../../hooks/useI18n';
import { GameIcon, type GameIconName } from './GameIcon';
import './navigation.css';
const links: { to: string; icon: GameIconName; en: string; fa: string }[] = [
  { to: '/', icon: 'home', en: 'Home', fa: 'خانه' },
  { to: '/game', icon: 'game', en: 'Game', fa: 'بازی' },
  { to: '/inventory', icon: 'inventory', en: 'Inventory', fa: 'دارایی' },
  { to: '/missions', icon: 'missions', en: 'Missions', fa: 'مأموریت' },
  { to: '/wallet', icon: 'wallet', en: 'Wallet', fa: 'کیف پول' },
  { to: '/profile', icon: 'profile', en: 'Profile', fa: 'پروفایل' },
];
export function BottomNavigation() {
  const { text } = useI18n();
  return <nav className="bottom-nav robot-nav" aria-label={text('Primary navigation', 'پیمایش اصلی')}>
    {links.map(link => <NavLink key={link.to} to={link.to} end={link.to === '/'}>
      <GameIcon name={link.icon} /><small>{text(link.en, link.fa)}</small>
    </NavLink>)}
  </nav>;
}
