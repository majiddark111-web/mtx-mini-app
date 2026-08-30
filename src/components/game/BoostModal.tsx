import { useBoosts } from '../../hooks/useBoosts';
import { formatDate } from '../../utils/format';
import { Link } from 'react-router-dom';
import { Modal } from '../common/Modal';

export function BoostModal({ onClose }: { onClose: () => void }) {
  const { boosts, history, buyUpgrade } = useBoosts();
  return <Modal title="⚡ Boost Upgrades" onClose={onClose}>
    <Link className="button primary" to="/inventory">🎒 Open Inventory · Use purchased boosts</Link>
    <div className="stack">{boosts.map((boost) => <article className="upgrade-card" key={boost.type}><div><strong>{boost.icon} {boost.label}</strong><p>Current: {boost.current}</p><p className="gold">{boost.quote ? `Next: ${boost.quote.value} · Cost: ${boost.quote.cost} MTX` : 'Max level reached'}</p><div className="progress"><div style={{ width: `${boost.progress}%` }} /></div></div><button className="button primary" type="button" disabled={!boost.quote} onClick={() => { if (!buyUpgrade(boost.type)) window.alert('Not enough MTX'); }}>Upgrade</button></article>)}</div>
    <h3>History</h3>
    {history.length === 0 ? <p className="muted">No upgrades yet.</p> : <div className="history-list">{history.map((item) => <div key={item.id}><span>{item.type === 'energy' ? '🔋' : '👆'} {item.text}</span><time>{formatDate(item.timestamp)}</time></div>)}</div>}
  </Modal>;
}
