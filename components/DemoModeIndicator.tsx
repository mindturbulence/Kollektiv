import React, { useState, useEffect } from 'react';
import { isDemoMode, onDemoModeChange } from '../utils/demoMode';

/**
 * Small "DEMO MODE" badge shown in the footer when the app is running
 * in demo mode (OPFS-backed, no real folder access).
 *
 * Renders nothing when demo mode is inactive.
 */
const DemoModeIndicator: React.FC = () => {
  const [active, setActive] = useState(isDemoMode());

  useEffect(() => {
    const unsub = onDemoModeChange(setActive);
    return unsub;
  }, []);

  if (!active) return null;

  return (
    <span className="uppercase tracking-widest text-accent font-mono text-[9px] font-black inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      DEMO MODE
    </span>
  );
};

export default DemoModeIndicator;
