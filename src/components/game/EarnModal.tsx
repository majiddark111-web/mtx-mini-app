import { MISSIONS } from '../../constants/game';
import { hapticTap, openExternalLink } from '../../services/telegramService';
import { Modal } from '../common/Modal';

export function EarnModal({ onClose }: { onClose: () => void }) {
  return <Modal title="🎯 Earn Tasks" onClose={onClose}>
    <p className="muted">Choose a task to earn MTX. Rewards remain demo-only until Phase 2.</p>
    <div className="stack">{MISSIONS.map((mission) => <article className="mission-card" key={mission.id}>
      <span className="mission-icon">{mission.icon}</span><div><strong>{mission.title}</strong><p>{mission.subtitle}</p><span className="gold">+{mission.reward} MTX</span></div>
      <button className="button primary" type="button" onClick={() => { hapticTap(); openExternalLink(mission.url); }}>Open</button>
    </article>)}</div>
  </Modal>;
}
