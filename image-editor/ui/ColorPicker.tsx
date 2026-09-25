// ─── Kollektiv Image Editor — Color Picker ─────────────────────────────────
// Foreground/background swatch editor. Native <input type="color"> for the
// saturation/hue picking UI itself (every browser already ships a real color
// picker — no reason to reimplement an SV square + hue slider) plus a hex
// field for direct entry and an RGB readout.

import React, { useEffect, useState } from 'react';
import FloatingPanel from './FloatingPanel';
import { dispatch, getSnapshot } from '../core/store';

interface ColorPickerProps {
  target: 'foreground' | 'background';
  onClose: () => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const ColorPicker: React.FC<ColorPickerProps> = ({ target, onClose }) => {
  const initial = getSnapshot().colors[target];
  const [hex, setHex] = useState(initial);
  const [hexDraft, setHexDraft] = useState(initial);

  // Live-preview as the native picker drags, without waiting for close.
  useEffect(() => {
    dispatch({ type: 'SET_COLORS', colors: { [target]: hex } });
  }, [hex, target]);

  const commitHexDraft = () => {
    const rgb = hexToRgb(hexDraft);
    if (rgb) {
      const normalized = `#${hexDraft.replace('#', '').toLowerCase()}`;
      setHex(normalized);
    } else {
      setHexDraft(hex); // invalid input — revert to last valid value
    }
  };

  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };

  return (
    <FloatingPanel
      title={target === 'foreground' ? 'Foreground Color' : 'Background Color'}
      defaultX={260} defaultY={120}
      defaultWidth={260} defaultHeight={220}
      onClose={onClose}
      footer={
        <button className="form-btn form-btn-primary rounded-none text-xs h-7 px-3 ml-auto" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3">
          <input
            type="color"
            value={hex}
            onChange={(e) => { setHex(e.target.value); setHexDraft(e.target.value); }}
            className="w-16 h-16 flex-shrink-0 border border-base-content/20 bg-transparent cursor-pointer"
          />
          <div
            className="flex-1 h-16 border border-base-content/20"
            style={{
              backgroundImage: 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)',
              backgroundSize: '8px 8px',
            }}
          >
            <div className="w-full h-full" style={{ backgroundColor: hex }} />
          </div>
        </label>

        <label className="flex items-center gap-2 text-2xs font-mono text-base-content/60">
          <span className="w-8">HEX</span>
          <input
            type="text"
            className="flex-1 bg-transparent border border-base-content/20 px-2 py-1 font-mono text-xs uppercase"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHexDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            maxLength={7}
          />
        </label>

        <div className="grid grid-cols-3 gap-2 text-2xs font-mono text-base-content/60">
          <span>R {rgb.r}</span>
          <span>G {rgb.g}</span>
          <span>B {rgb.b}</span>
        </div>
      </div>
    </FloatingPanel>
  );
};

export default ColorPicker;
