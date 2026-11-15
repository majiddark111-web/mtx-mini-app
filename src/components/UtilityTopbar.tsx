import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { GameIcon } from './navigation/GameIcon';
import '../pages/utility.css';

export function UtilityTopbar({ destination }: { destination: 'settings' | 'notifications' }) {
  const { text } = useI18n();
  return <div className="utility-topbar">
    <Link className="utility-brand" to="/">Tokx <span>Tap</span></Link>
    <Link className="utility-switch" to={'/' + destination}>
      <GameIcon name={destination} />
      <span>{destination === 'settings' ? text('Settings', 'تنظیمات') : text('Notifications', 'اعلان‌ها')}</span>
    </Link>
  </div>;
}
