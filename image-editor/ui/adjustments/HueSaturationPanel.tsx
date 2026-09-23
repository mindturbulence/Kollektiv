// ─── Kollektiv Image Editor — Hue / Saturation Panel ─────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import FloatingPanel from '../FloatingPanel';
import { AdjustmentEngine } from '../../core/adjust/AdjustmentEngine';
import { pushCommand } from '../../core/history/HistoryManager';
import { dispatch, getSnapshot } from '../../core/store';
import { findLayerById } from '../../core/layers/layerTree';
import type { ImageLayer } from '../../core/types';

interface HueSaturationPanelProps { layerId: string; onClose: () => void; }

const HueSaturationPanel: React.FC<HueSaturationPanelProps> = ({ layerId, onClose }) => {
  const [hue,        setHue]        = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [lightness,  setLightness]  = useState(0);
  const [colorize,   setColorize]   = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const sourceRef = useRef<ImageBitmap | null>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const doc = getSnapshot().document;
    const layer = (doc && findLayerById(doc.layers, layerId)) as ImageLayer | undefined;
    sourceRef.current = layer?.bitmap ?? null;
    return () => { AdjustmentEngine.clearPreview(layerId); };
  }, [layerId]);

  useEffect(() => {
    if (!sourceRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!sourceRef.current) return;
      AdjustmentEngine.updatePreview(layerId, sourceRef.current, {
        kind: 'hue-saturation', hue, saturation, lightness, colorize,
      });
    });
  }, [layerId, hue, saturation, lightness, colorize]);

  const handleOk = async () => {
    if (!sourceRef.current) return;
    setIsCommitting(true);
    try {
      const cmd = await AdjustmentEngine.commitAdjustment(layerId, sourceRef.current, {
        kind: 'hue-saturation', hue, saturation, lightness, colorize,
      });
      pushCommand(cmd);
      AdjustmentEngine.clearPreview(layerId);
      dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'hue-sat' });
      onClose();
    } finally { setIsCommitting(false); }
  };

  const sliders = [
    {
      label: 'Hue',        value: hue,        set: setHue,        min: -180, max: 180, step: 1,
      gradient: 'linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
    },
    {
      label: 'Saturation', value: saturation, set: setSaturation, min: -100, max: 100, step: 1,
      gradient: 'linear-gradient(to right, #888, #C0F04C)',
    },
    {
      label: 'Lightness',  value: lightness,  set: setLightness,  min: -100, max: 100, step: 1,
      gradient: 'linear-gradient(to right, #000, #fff)',
    },
  ];

  return (
    <FloatingPanel
      title="Hue / Saturation"
      defaultX={360} defaultY={80}
      defaultWidth={360} defaultHeight={260}
      onClose={() => { AdjustmentEngine.clearPreview(layerId); onClose(); }}
      footer={
        <>
          <button className="form-btn rounded-none text-xs h-7 px-3" onClick={() => { AdjustmentEngine.clearPreview(layerId); onClose(); }}>Cancel</button>
          <button className="form-btn form-btn-primary rounded-none text-xs h-7 px-3" disabled={isCommitting} onClick={handleOk}>
            {isCommitting ? 'Applying…' : 'OK'}
          </button>
        </>
      }
    >
      <div className="space-y-4 pt-1">
        {sliders.map(({ label, value, set, min, max, step, gradient }) => (
          <div key={label}>
            <label className="flex items-center gap-2 text-[10px] font-mono text-base-content/60 mb-1">
              <span className="w-20 flex-shrink-0">{label}</span>
              <input type="number" className="w-14 bg-transparent border border-base-content/20 px-1 text-right text-[10px]"
                min={min} max={max} step={step} value={value}
                onChange={e => set(Math.max(min, Math.min(max, Number(e.target.value))))} />
            </label>
            <div className="relative h-3 rounded-none" style={{ background: gradient, border: '1px solid rgba(255,255,255,0.1)' }}>
              <input type="range" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                min={min} max={max} step={step} value={value}
                onChange={e => set(Number(e.target.value))} />
              {/* Thumb indicator */}
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white border border-base-content/40 pointer-events-none shadow"
                style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 4px)` }} />
            </div>
          </div>
        ))}

        {/* Colorize toggle */}
        <label className="flex items-center gap-3 text-[10px] font-mono text-base-content/60">
          <span>Colorize</span>
          <input type="checkbox" className="toggle toggle-xs toggle-primary"
            checked={colorize} onChange={e => setColorize(e.target.checked)} />
        </label>
      </div>
    </FloatingPanel>
  );
};

export default HueSaturationPanel;
