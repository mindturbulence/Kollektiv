/* TEMP verification harness — mounts StormBackground with the real theme CSS. Delete after use. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import StormBackground from './components/StormBackground';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ position: 'fixed', inset: 0 }}>
      <StormBackground />
    </div>
  </React.StrictMode>
);
