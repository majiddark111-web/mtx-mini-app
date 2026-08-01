import { ENERGY_CAPS, TAP_POWERS } from '../../constants/game';
import { getUpgradeQuote, progress } from '../../services/gameService';
import { useAppStore } from '../../store/useAppStore';
import type { UpgradeType } from '../../types/game';
import { Modal } from '../common/Modal';

export function BoostModal({ onClose }: { onClose: () => void }) {
  const state = useAppStore();
  const buyUpgrade = useAppStore((item) => item.buyUpgrade);
  const renderUpgrade = (type: UpgradeType, label: string, icon: string) => {
    const quote = getUpgradeQuote(type, state);
    const level = type === 'energy' ? state.energyLevel : state.tapLevel;
    const maximum = type === 'energy' ? ENERGY_CAPS.length : TAP_POWERS.length;
    return <article className="upgrade-card">
      <div><strong>{icon} {label}</strong><p>Current: {type === 'energy' ? state.maxEnergy : `${state.tapPower} /tap`}</p>
        <p className="gold">{quote ? `Next: ${quote.value} · Cost: ${quote.cost} MTX` : 'Max level reached'}</p>
        <div className="progress"><div style={{ width: `${progress(level, maximum)}%` }} /></div>
      </div>
      <button className="button primary" type="button" disabled={!quote} onClick={() => { if (!buyUpgrade(type)) window.alert('Not enough MTX'); }}>Upgrade</button>
    </article>;
  };
  return <Modal title="⚡ Boost Upgrades" onClose={onClose}>
    <div className="stack">{renderUpgrade('energy', 'Extra Energy', '🔋')}{renderUpgrade('tap', 'Extra Tap', '👆')}</div>
    <h3>History</h3>
    {state.boostHistory.length === 0 ? <p className="muted">No upgrades yet.</p> : <div className="history-list">{state.boostHistory.map((item) => <div key={item.id}><span>{item.type === 'energy' ? '🔋' : '👆'} {item.text}</span><time>{new Date(item.timestamp).toLocaleString()}</time></div>)}</div>}
  </Modal>;
}
