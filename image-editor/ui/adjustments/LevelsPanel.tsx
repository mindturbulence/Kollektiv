// ─── Kollektiv Image Editor — Levels Panel ───────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import FloatingPanel from '../FloatingPanel';
import { AdjustmentEngine } from '../../core/adjust/AdjustmentEngine';
import { pushCommand } from '../../core/history/HistoryManager';
import { dispatch, getSnapshot } from '../../core/store';
import { findLayerById } from '../../core/layers/layerTree';
import type { AdjustmentChannel, ImageLayer } from '../../core/types';

interface LevelsPanelProps { layerId: string; onClose: () => void; }

// ─── Histogram helper ─────────────────────────────────────────────────────────

function buildHistogram(bitmap: ImageBitmap, channel: AdjustmentChannel): Uint32Array {
  const oc = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = oc.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, oc.width, oc.height);
  const counts = new Uint32Array(256);
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    if (channel === 'rgb') {
      counts[Math.round((data[i] + data[i+1] + data[i+2]) / 3)]++;
    } else if (channel === 'r') { counts[data[i]]++;
    } else if (channel === 'g') { counts[data[i+1]]++;
    } else                       { counts[data[i+2]]++; }
  }
  return counts;
}

function drawHistogram(canvas: HTMLCanvasElement, counts: Uint32Array): void {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(1, ...counts);
  const logMax = Math.log(max + 1);
  ctx.fillStyle = 'rgba(192,240,76,0.4)';
  for (let i = 0; i < 256; i++) {
    const h = (Math.log(counts[i] + 1) / logMax) * H;
    const x = Math.round((i / 255) * (W - 1));
    ctx.fillRect(x, H - h, Math.ceil(W / 256), h);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const LevelsPanel: React.FC<LevelsPanelProps> = ({ layerId, onClose }) => {
  const [channel,  setChannel]  = useState<AdjustmentChannel>('rgb');
  const [inBlack,  setInBlack]  = useState(0);
  const [inWhite,  setInWhite]  = useState(255);
  const [gamma,    setGamma]    = useState(1.0);
  const [outBlack, setOutBlack] = useState(0);
  const [outWhite, setOutWhite] = useState(255);
  const [isCommitting, setIsCommitting] = useState(false);
  const histCanvas = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number | null>(null);

  // Capture source bitmap at open time
  const sourceRef = useRef<ImageBitmap | null>(null);
  useEffect(() => {
    const doc = getSnapshot().document;
    const layer = (doc && findLayerById(doc.layers, layerId)) as ImageLayer | undefined;
    sourceRef.current = layer?.bitmap ?? null;
    return () => { AdjustmentEngine.clearPreview(layerId); };
  }, [layerId]);

  // Draw histogram when channel changes
  useEffect(() => {
    const bitmap = sourceRef.current;
    if (!bitmap || !histCanvas.current) return;
    const counts = buildHistogram(bitmap, channel);
    drawHistogram(histCanvas.current, counts);
  }, [channel]);

  // Trigger preview on every parameter change
  useEffect(() => {
    if (!sourceRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!sourceRef.current) return;
      void AdjustmentEngine.updatePreview(layerId, sourceRef.current, {
        kind: 'levels', channel, inBlack, inWhite, gamma, outBlack, outWhite,
      });
    });
  }, [layerId, channel, inBlack, inWhite, gamma, outBlack, outWhite]);

  const handleAuto = () => {
    const bitmap = sourceRef.current;
    if (!bitmap) return;
    const counts = buildHistogram(bitmap, channel);
    const total = counts.reduce((a, b) => a + b, 0);
    const clip = total * 0.005;
    let cumLow = 0, lo = 0;
    for (; lo < 256 && cumLow < clip; lo++) cumLow += counts[lo];
    let cumHigh = 0, hi = 255;
    for (; hi > lo && cumHigh < clip; hi--) cumHigh += counts[hi];
    setInBlack(lo); setInWhite(hi);
  };

  const handleOk = async () => {
    if (!sourceRef.current) return;
    setIsCommitting(true);
    try {
      const cmd = await AdjustmentEngine.commitAdjustment(layerId, sourceRef.current, {
        kind: 'levels', channel, inBlack, inWhite, gamma, outBlack, outWhite,
      });
      pushCommand(cmd);
      AdjustmentEngine.clearPreview(layerId);
      dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'levels' });
      onClose();
    } finally { setIsCommitting(false); }
  };

  const channels: AdjustmentChannel[] = ['rgb', 'r', 'g', 'b'];

  return (
    <FloatingPanel
      title="Levels"
      defaultX={320} defaultY={80}
      defaultWidth={380} defaultHeight={340}
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
      {/* Channel tabs */}
      <div className="flex gap-1 mb-3">
        {channels.map(ch => (
          <button key={ch} type="button"
            className={`px-2 py-0.5 text-2xs font-mono uppercase border ${channel === ch ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
            onClick={() => { setChannel(ch); setInBlack(0); setInWhite(255); setGamma(1); setOutBlack(0); setOutWhite(255); }}>
            {ch.toUpperCase()}
          </button>
        ))}
        <button type="button" className="ml-auto px-2 py-0.5 text-2xs font-mono uppercase border border-base-content/20 text-base-content/60 hover:border-primary hover:text-primary" onClick={handleAuto}>Auto</button>
      </div>

      {/* Histogram */}
      <canvas ref={histCanvas} width={256} height={80} className="w-full h-20 border border-base-content/10 mb-2" />

      {/* Input sliders */}
      <div className="space-y-1.5 text-2xs font-mono text-base-content/60">
        {[
          { label: 'In Black',  value: inBlack,  set: setInBlack,  min: 0,   max: 254, step: 1 },
          { label: 'Gamma',     value: gamma,     set: setGamma,    min: 0.1, max: 9.99, step: 0.01 },
          { label: 'In White',  value: inWhite,   set: setInWhite,  min: 1,   max: 255, step: 1 },
          { label: 'Out Black', value: outBlack,  set: setOutBlack, min: 0,   max: 254, step: 1 },
          { label: 'Out White', value: outWhite,  set: setOutWhite, min: 1,   max: 255, step: 1 },
        ].map(({ label, value, set, min, max, step }) => (
          <label key={label} className="flex items-center gap-2">
            <span className="w-16 flex-shrink-0">{label}</span>
            <input type="range" className="range range-xs range-primary flex-1" min={min} max={max} step={step} value={value}
              onChange={e => set(Number(e.target.value))} />
            <input type="number" className="w-14 bg-transparent border border-base-content/20 px-1 text-right" min={min} max={max} step={step} value={value}
              onChange={e => set(Number(e.target.value))} />
          </label>
        ))}
      </div>
    </FloatingPanel>
  );
};

export default LevelsPanel;
