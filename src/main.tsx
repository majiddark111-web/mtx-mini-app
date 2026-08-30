import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import App from './App';
import './styles/tokens.css';
import './animations/motion.css';
import './index.css';

(window as typeof window & { Buffer: typeof Buffer }).Buffer = Buffer;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
