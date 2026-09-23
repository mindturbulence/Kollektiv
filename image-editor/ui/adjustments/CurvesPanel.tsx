// ─── Kollektiv Image Editor — Curves Panel ───────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import FloatingPanel from '../FloatingPanel';
import { AdjustmentEngine } from '../../core/adjust/AdjustmentEngine';
import { buildCurvesLUT, type CurvePoint } from '../../core/adjust/kernels';
import { pushCommand } from '../../core/history/HistoryManager';
import { dispatch, getSnapshot } from '../../core/store';
import { findLayerById } from '../../core/layers/layerTree';
import type { AdjustmentChannel, ImageLayer } from '../../core/types';

interface CurvesPanelProps { layerId: string; onClose: () => void; }

const GRAPH_SIZE = 256;
const PT_RADIUS  = 6;

const CurvesPanel: React.FC<CurvesPanelProps> = ({ layerId, onClose }) => {
  const [channel,    setChannel]    = useState<AdjustmentChannel>('rgb');
  const [points,     setPoints]     = useState<CurvePoint[]>([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ImageBitmap | null>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const doc = getSnapshot().document;
    const layer = (doc && findLayerById(doc.layers, layerId)) as ImageLayer | undefined;
    sourceRef.current = layer?.bitmap ?? null;
    return () => { AdjustmentEngine.clearPreview(layerId); };
  }, [layerId]);

  // Redraw graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const S = GRAPH_SIZE;
    ctx.clearRect(0, 0, S, S);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * S / 4, 0); ctx.lineTo(i * S / 4, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke();
    }

    // Identity diagonal
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S, 0); ctx.stroke();

    // Spline via LUT
    const lut = buildCurvesLUT(points);
    ctx.strokeStyle = '#C0F04C';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const px = (x / 255) * S;
      const py = S - (lut[x] / 255) * S;
      x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Control points
    points.forEach((p, i) => {
      const px = (p.x / 255) * S, py = S - (p.y / 255) * S;
      ctx.beginPath(); ctx.arc(px, py, PT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = i === selectedIdx ? '#C0F04C' : 'white';
      ctx.strokeStyle = '#C0F04C'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
    });
  }, [points, selectedIdx]);

  // Preview
  useEffect(() => {
    if (!sourceRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!sourceRef.current) return;
      AdjustmentEngine.updatePreview(layerId, sourceRef.current, { kind: 'curves', channel, points });
    });
  }, [layerId, channel, points]);

  const canvasToPoint = (e: React.MouseEvent): CurvePoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));
    return { x, y };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const { x, y } = canvasToPoint(e);
    // Check if clicking near an existing point
    const S = canvasRef.current!.getBoundingClientRect().width;
    const hitIdx = points.findIndex(p => {
      const px = (p.x / 255) * S, py = (1 - p.y / 255) * S;
      const cx = (x / 255) * S, cy = (1 - y / 255) * S;
      return Math.hypot(px - cx, py - cy) < PT_RADIUS * 2;
    });
    if (hitIdx >= 0) { setSelectedIdx(hitIdx); return; }
    const newPts = [...points, { x, y }].sort((a, b) => a.x - b.x);
    setPoints(newPts);
    setSelectedIdx(newPts.findIndex(p => p.x === x && p.y === y));
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (selectedIdx === null || e.buttons !== 1) return;
    const { x, y } = canvasToPoint(e);
    setPoints(prev => prev.map((p, i) => i === selectedIdx ? { x, y } : p));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null && points.length > 2) {
      setPoints(prev => prev.filter((_, i) => i !== selectedIdx));
      setSelectedIdx(null);
    }
  };

  const handleOk = async () => {
    if (!sourceRef.current) return;
    setIsCommitting(true);
    try {
      const cmd = await AdjustmentEngine.commitAdjustment(layerId, sourceRef.current, { kind: 'curves', channel, points });
      pushCommand(cmd);
      AdjustmentEngine.clearPreview(layerId);
      dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'curves' });
      onClose();
    } finally { setIsCommitting(false); }
  };

  const channels: AdjustmentChannel[] = ['rgb', 'r', 'g', 'b'];

  return (
    <FloatingPanel
      title="Curves"
      defaultX={340} defaultY={80}
      defaultWidth={320} defaultHeight={400}
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
            className={`px-2 py-0.5 text-[10px] font-mono uppercase border ${channel === ch ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60'}`}
            onClick={() => { setChannel(ch); setPoints([{ x: 0, y: 0 }, { x: 255, y: 255 }]); setSelectedIdx(null); }}>
            {ch.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Curve graph */}
      <canvas
        ref={canvasRef}
        width={GRAPH_SIZE} height={GRAPH_SIZE}
        className="w-full aspect-square bg-base-100/60 border border-base-content/10 cursor-crosshair"
        style={{ touchAction: 'none' }}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
      <p className="text-[9px] font-mono text-base-content/40 mt-1">Click to add points · Delete to remove · Drag to move</p>
    </FloatingPanel>
  );
};

export default CurvesPanel;
