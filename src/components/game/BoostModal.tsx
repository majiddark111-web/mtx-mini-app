import { Link } from 'react-router-dom';
import { Modal } from '../common/Modal';

export function BoostModal({ onClose }: { onClose: () => void }) {
  return <Modal title="⚡ Boost & Upgrades" onClose={onClose}>
    <p className="muted">Permanent upgrades are purchased securely from the server. Consumable boosts are used from Inventory.</p>
    <div className="stack"><Link className="button primary" to="/store?category=upgrade">⬆️ Open Upgrade Store</Link><Link className="button ghost" to="/inventory">🎒 Open Inventory · Use boosts</Link></div>
  </Modal>;
}
