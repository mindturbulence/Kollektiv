/* TEMP live-tuning harness — mounts StormBackground fullscreen with real theme CSS.
   Includes a theme switcher (keys 1-4) and a "copy my settings" console helper.
   Delete after tuning. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import StormBackground from './components/StormBackground';

const THEMES = ['Kollektiv', 'Stellar', 'pipboy', 'abyss'];

function App() {
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const i = ['1', '2', '3', '4'].indexOf(e.key);
            if (i >= 0) document.documentElement.setAttribute('data-theme', THEMES[i]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <StormBackground />
            <div style={{
                position: 'fixed', top: 12, left: 12, zIndex: 10, color: '#9aa',
                font: '11px monospace', opacity: 0.7, pointerEvents: 'none',
            }}>
                TUNING HARNESS — keys: 1 Kollektiv · 2 Stellar · 3 pipboy · 4 abyss<br />
                devtools: __STORM__.trailDecay / .radius / .trailGain / .brush / .strikeNow()<br />
                copy settings: copy(JSON.stringify(__STORM__))
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
