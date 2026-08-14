import { Link } from 'react-router-dom';
export function PlaceholderPage({ title, description }: { title: string; description: string }) { return <main className="page"><Link className="brand" to="/">MTX</Link><section className="page-card"><h1>{title}</h1><p>{description}</p><span className="phase-badge">Phase 1 route ready</span></section></main>; }
