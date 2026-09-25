// ─── Kollektiv Image Editor — Exposure Panel ─────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import FloatingPanel from '../FloatingPanel';
import { AdjustmentEngine } from '../../core/adjust/AdjustmentEngine';
import { pushCommand } from '../../core/history/HistoryManager';
import { dispatch, getSnapshot } from '../../core/store';
import { findLayerById } from '../../core/layers/layerTree';
import type { ImageLayer } from '../../core/types';

interface ExposurePanelProps { layerId: string; onClose: () => void; }

const ExposurePanel: React.FC<ExposurePanelProps> = ({ layerId, onClose }) => {
  const [exposure,        setExposure]        = useState(0);    // stops, -5 … +5
  const [offset,          setOffset]          = useState(0);    // -1 … 1
  const [gammaCorrection, setGammaCorrection] = useState(1.0);  // 0.1 … 9.99
  const [isCommitting, setIsCommitting]       = useState(false);
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
      void AdjustmentEngine.updatePreview(layerId, sourceRef.current, {
        kind: 'exposure', exposure, offset, gammaCorrection,
      });
    });
  }, [layerId, exposure, offset, gammaCorrection]);

  const handleOk = async () => {
    if (!sourceRef.current) return;
    setIsCommitting(true);
    try {
      const cmd = await AdjustmentEngine.commitAdjustment(layerId, sourceRef.current, {
        kind: 'exposure', exposure, offset, gammaCorrection,
      });
      pushCommand(cmd);
      AdjustmentEngine.clearPreview(layerId);
      dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'exposure' });
      onClose();
    } finally { setIsCommitting(false); }
  };

  const sliders = [
    { label: 'Exposure',   value: exposure,        set: setExposure,        min: -5,  max: 5,   step: 0.01, fmt: (v: number) => v.toFixed(2) },
    { label: 'Offset',     value: offset,          set: setOffset,          min: -1,  max: 1,   step: 0.001, fmt: (v: number) => v.toFixed(3) },
    { label: 'Gamma Corr', value: gammaCorrection, set: setGammaCorrection, min: 0.1, max: 9.99, step: 0.01, fmt: (v: number) => v.toFixed(2) },
  ];

  return (
    <FloatingPanel
      title="Exposure"
      defaultX={380} defaultY={80}
      defaultWidth={340} defaultHeight={200}
      onClose={() => { AdjustmentEngine.clearPreview(layerId); onClose(); }}
      footer={
        <>
          <button className="form-btn rounded-none text-xs h-7 px-3"
            onClick={() => { AdjustmentEngine.clearPreview(layerId); onClose(); }}>Cancel</button>
          <button className="form-btn form-btn-primary rounded-none text-xs h-7 px-3"
            disabled={isCommitting} onClick={handleOk}>
            {isCommitting ? 'Applying…' : 'OK'}
          </button>
        </>
      }
    >
      <div className="space-y-3 pt-1">
        {sliders.map(({ label, value, set, min, max, step, fmt }) => (
          <label key={label} className="flex items-center gap-2 text-2xs font-mono text-base-content/60">
            <span className="w-20 flex-shrink-0">{label}</span>
            <input type="range" className="range range-xs range-primary flex-1"
              min={min} max={max} step={step} value={value}
              onChange={e => set(Number(e.target.value))} />
            <input type="number" className="w-16 bg-transparent border border-base-content/20 px-1 text-right text-2xs"
              min={min} max={max} step={step} value={fmt(value)}
              onChange={e => set(Math.max(min, Math.min(max, Number(e.target.value))))} />
          </label>
        ))}
        <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary"
          onClick={() => { setExposure(0); setOffset(0); setGammaCorrection(1.0); }}>
          Reset to defaults
        </button>
      </div>
    </FloatingPanel>
  );
};

export default ExposurePanel;
