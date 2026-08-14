import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
export function HomePage() { const score = useAppStore((state) => state.score); return <main className="page"><span className="brand">MTX</span><section className="hero"><span className="phase-badge">Telegram Mini App</span><h1>Tap. Earn. Level up.</h1><p>Your current demo balance is <strong>{score} MTX</strong>.</p><Link className="button primary launch" to="/game">Play MTX</Link></section></main>; }
