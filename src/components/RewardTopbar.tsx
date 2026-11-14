import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { GameIcon } from './navigation/GameIcon';
import '../pages/rewards.css';

export function RewardTopbar({ destination }: { destination: 'missions' | 'daily-reward' }) {
  const { text } = useI18n();
  const missions = destination === 'missions';
  return <div className="reward-topbar">
    <Link className="reward-brand" to="/">Tokx <span>Tap</span></Link>
    <Link className="reward-switch" to={'/' + destination}>
      <GameIcon name={missions ? 'missions' : 'earn'} />
      <span>{missions ? text('Missions', 'مأموریت‌ها') : text('Daily Reward', 'پاداش روزانه')}</span>
    </Link>
  </div>;
}
