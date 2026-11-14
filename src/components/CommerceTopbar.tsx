import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { GameIcon } from './navigation/GameIcon';
import '../pages/commerce.css';

export function CommerceTopbar({ destination }: { destination: 'store' | 'inventory' }) {
  const { text } = useI18n();
  return <div className="commerce-topbar">
    <Link className="commerce-brand" to="/">Tokx <span>Tap</span></Link>
    <Link className="commerce-switch" to={'/' + destination}>
      <GameIcon name={destination} />
      <span>{destination === 'store' ? text('Store', 'فروشگاه') : text('Inventory', 'دارایی‌ها')}</span>
    </Link>
  </div>;
}
