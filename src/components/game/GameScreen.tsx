import { useState } from 'react';
import { ASSETS } from '../../assets';
import { useEnergyRecharge } from '../../hooks/useEnergyRecharge';
import { useTapAction } from '../../hooks/useTapAction';
import { useAppStore } from '../../store/useAppStore';
import { BoostModal } from './BoostModal';
import { EarnModal } from './EarnModal';

export function GameScreen() {
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
      <div className="tap-zone"><strong className="score">{score} MTX</strong><button className={`coin-button ${equippedSkin === 'skin:aurora' ? 'coin-aurora' : ''}`} type="button" aria-label="Tap MTX coin" onClick={tap}><img src={ASSETS.coin} alt="MTX coin" /></button>
        <div className="energy-track"><div style={{ width: `${energyPercentage}%` }} /></div><span>Energy: {energy} / {maxEnergy}</span><span className="profit-rate">📈 {profitPerHour.toLocaleString()} MTX / hour</span>
      </div>
      <div className="game-actions"><button type="button" onClick={() => setModal('boost')}>⚡<span>Boost</span></button><button type="button" onClick={() => setModal('earn')}>🎯<span>Earn</span></button></div>
    </section>
    {modal === 'boost' && <BoostModal onClose={() => setModal(null)} />}{modal === 'earn' && <EarnModal onClose={() => setModal(null)} />}
  </main>;
}
