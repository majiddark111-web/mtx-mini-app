import { useState } from 'react';
import { ASSETS } from '../../assets';
import { useEnergyRecharge } from '../../hooks/useEnergyRecharge';
import { useTapAction } from '../../hooks/useTapAction';
import { useAppStore } from '../../store/useAppStore';
import { BoostModal } from './BoostModal';
import { EarnModal } from './EarnModal';
import { useI18n } from '../../hooks/useI18n';

export function GameScreen() {
  const { text, number } = useI18n();
  const [modal, setModal] = useState<'boost' | 'earn' | null>(null);
  const score = useAppStore((state) => state.score);
  const energy = useAppStore((state) => state.energy);
  const maxEnergy = useAppStore((state) => state.maxEnergy);
  const profitPerHour = useAppStore((state) => state.profitPerHour);
  const equippedSkin = useAppStore((state) => state.inventory.equippedSkin);
  const tap = useTapAction();
  const user = useAppStore((state) => state.user);
  useEnergyRecharge();
  const energyPercentage = Math.min(100, Math.max(0, energy / Math.max(1, maxEnergy) * 100));
  return <main className="game-screen">
    <div className="galaxy" />
    <section className="game-content">
      <header className="profile-row">{user.avatar && <img src={user.avatar} alt="" />}<span>@{user.username}</span></header>
      <div className="tap-zone"><strong className="score">{number(score)} MTX</strong><button className={`coin-button ${equippedSkin === 'skin:aurora' ? 'coin-aurora' : ''}`} type="button" aria-label={text('Tap MTX coin', 'تپ روی سکه MTX')} onClick={tap}><img src={ASSETS.coin} alt="MTX coin" /></button>
        <div className="energy-track"><div style={{ width: `${energyPercentage}%` }} /></div><span>{text('Energy', 'انرژی')}: {number(energy)} / {number(maxEnergy)}</span><span className="profit-rate">📈 {number(profitPerHour)} MTX / {text('hour', 'ساعت')}</span>
      </div>
      <div className="game-actions"><button type="button" onClick={() => setModal('boost')}>⚡<span>{text('Boost', 'بوست')}</span></button><button type="button" onClick={() => setModal('earn')}>🎯<span>{text('Earn', 'درآمد')}</span></button></div>
    </section>
    {modal === 'boost' && <BoostModal onClose={() => setModal(null)} />}{modal === 'earn' && <EarnModal onClose={() => setModal(null)} />}
  </main>;
}
