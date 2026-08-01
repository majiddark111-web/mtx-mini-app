import { useState } from 'react';
import { useEnergyRecharge } from '../../hooks/useEnergyRecharge';
import { useAppStore } from '../../store/useAppStore';
import { BoostModal } from './BoostModal';
import { EarnModal } from './EarnModal';

export function GameScreen() {
  const [modal, setModal] = useState<'boost' | 'earn' | null>(null);
  const score = useAppStore((state) => state.score);
  const energy = useAppStore((state) => state.energy);
  const maxEnergy = useAppStore((state) => state.maxEnergy);
  const tap = useAppStore((state) => state.tap);
  const user = useAppStore((state) => state.user);
  useEnergyRecharge();
  const energyPercentage = Math.min(100, Math.max(0, energy / Math.max(1, maxEnergy) * 100));
  return <main className="game-screen">
    <div className="galaxy" />
    <section className="game-content">
      <header className="profile-row">{user.avatar && <img src={user.avatar} alt="" />}<span>@{user.username}</span></header>
      <div className="tap-zone"><strong className="score">{score} MTX</strong><button className="coin-button" type="button" aria-label="Tap Lumos coin" onClick={tap}><img src="./mtx.png" alt="MTX coin" /></button>
        <div className="energy-track"><div style={{ width: `${energyPercentage}%` }} /></div><span>Energy: {energy} / {maxEnergy}</span>
      </div>
      <div className="game-actions"><button type="button" onClick={() => setModal('boost')}>⚡<span>Boost</span></button><button type="button" onClick={() => setModal('earn')}>🎯<span>Earn</span></button></div>
    </section>
    {modal === 'boost' && <BoostModal onClose={() => setModal(null)} />}{modal === 'earn' && <EarnModal onClose={() => setModal(null)} />}
  </main>;
}
