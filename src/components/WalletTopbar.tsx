import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { GameIcon } from './navigation/GameIcon';
import '../pages/wallet.css';

export function WalletTopbar({ destination }: { destination: 'wallet' | 'history' }) {
  const { text } = useI18n();
  return <div className="wallet-topbar">
    <Link className="wallet-brand" to="/">Tokx <span>Tap</span></Link>
    <Link className="wallet-switch" to={'/' + destination}>
      <GameIcon name={destination} />
      <span>{destination === 'wallet' ? text('Wallet', 'کیف پول') : text('Activity History', 'تاریخچه فعالیت')}</span>
    </Link>
  </div>;
}
