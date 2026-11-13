import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GameIcon } from '../navigation/GameIcon';
import './robot-game.css';
import { useEnergyRecharge } from '../../hooks/useEnergyRecharge';
import { useTapAction } from '../../hooks/useTapAction';
import { useAppStore } from '../../store/useAppStore';
import { BoostModal } from './BoostModal';
import { EarnModal } from './EarnModal';
import { useI18n } from '../../hooks/useI18n';
import { PlayerDiagnostics } from './PlayerDiagnostics';

export function GameScreen() {
  const { text, number } = useI18n();
  const [modal, setModal] = useState<'boost' | 'earn' | null>(null);
  const score = useAppStore((state) => state.score);
  const energy = useAppStore((state) => state.energy);
  const maxEnergy = useAppStore((state) => state.maxEnergy);
  const profitPerHour = useAppStore((state) => state.profitPerHour);
  const equippedSkin = useAppStore((state) => state.inventory.equippedSkin);
  const tapPower = useAppStore((state) => state.tapPower);
  const authStatus = useAppStore((state) => state.authStatus);
  const tap = useTapAction();
  const user = useAppStore((state) => state.user);
  useEnergyRecharge();
  const energyPercentage = Math.min(100, Math.max(0, energy / Math.max(1, maxEnergy) * 100));
  return <main className="game-screen robot-game">
    <section className="game-content">
      <header className="robot-header"><Link to="/" className="robot-wordmark">Tokx <span>Tap</span></Link><Link to="/settings" aria-label={text('Settings', 'تنظیمات')}><GameIcon name="settings" /></Link></header>
      <div className="profile-row">{user.avatar ? <img src={user.avatar} alt="" /> : <GameIcon name="profile" />}<span><bdi>{user.username ? `@${user.username}` : text('Player', 'بازیکن')}</bdi></span><i className={authStatus === 'authenticated' ? 'player-connected' : ''} aria-label={text('Sign-in status', 'وضعیت ورود') + ': ' + authStatus} /></div>
      <div className="tap-zone">
        <span className="balance-label">{text('Balance', 'موجودی')}</span>
        <strong className="score"><bdi>{number(score)} MTX</bdi></strong>
        <div className="robot-stage">
          <picture><source srcSet="/mtx-robot-scene.webp" type="image/webp" /><img className="robot-scene" src="/mtx-robot-scene.png" alt="" width="1122" height="1402" decoding="async" draggable={false} /></picture>
          <button className={`coin-button ${equippedSkin === 'skin:aurora' ? 'coin-aurora' : ''}`} type="button" aria-label={text('Tap MTX coin', 'تپ روی سکه MTX')} onClick={tap}><span className="robot-coin-face" aria-hidden="true">MTX</span></button>
        </div>
        <span className="tap-power"><bdi>+{number(tapPower)}</bdi> {text('per tap', 'برای هر تپ')}</span>
        <span className="profit-rate"><bdi>{number(profitPerHour)} MTX</bdi> / {text('hour', 'ساعت')}</span>
        <div className="robot-energy"><div className="robot-energy-label"><span><GameIcon name="boost" />{text('Energy', 'انرژی')}</span><bdi>{number(energy)} / {number(maxEnergy)}</bdi></div><div className="energy-track" role="progressbar" aria-label={text('Energy', 'انرژی')} aria-valuemin={0} aria-valuemax={Math.max(1, maxEnergy)} aria-valuenow={Math.min(Math.max(1, maxEnergy), Math.max(0, energy))}><div style={{ width: `${energyPercentage}%` }} /></div></div>
      </div>
      <div className="game-actions"><button type="button" onClick={() => setModal('boost')}><GameIcon name="boost" /><span>{text('Boost', 'بوست')}</span></button><button type="button" onClick={() => setModal('earn')}><GameIcon name="earn" /><span>{text('Earn', 'درآمد')}</span></button></div>
      <PlayerDiagnostics />
    </section>
    {modal === 'boost' && <BoostModal onClose={() => setModal(null)} />}{modal === 'earn' && <EarnModal onClose={() => setModal(null)} />}
  </main>;
}
