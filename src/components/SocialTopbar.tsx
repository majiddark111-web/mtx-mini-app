import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { GameIcon } from './navigation/GameIcon';
import '../pages/social.css';

export function SocialTopbar({ destination }: { destination: 'referral' | 'leaderboard' }) {
  const { text } = useI18n();
  const board = destination === 'leaderboard';
  return <div className="social-topbar">
    <Link className="social-brand" to="/">Tokx <span>Tap</span></Link>
    <Link className="social-switch" to={'/' + destination}>
      <GameIcon name={board ? 'trophy' : 'friends'} />
      <span>{board ? text('Leaderboard', 'جدول رتبه‌بندی') : text('Invite Friends', 'دعوت دوستان')}</span>
    </Link>
  </div>;
}
