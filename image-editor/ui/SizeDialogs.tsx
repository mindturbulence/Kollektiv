// ─── Kollektiv Image Editor — Size Dialogs (M5 item 6) ──────────────────────
// Image Size (resample the active layer) and Canvas Size (grow/shrink the
// document with an anchor). Portal-rendered modals using the editor's existing
// panel/form-btn chrome (the shared Modal migration is D2; these follow the
// same structure so that migration is a drop-in).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../core/store';
import { findLayerById } from '../core/layers/layerTree';
import * as LayerManager from '../core/layers/LayerManager';
import { MAX_DIM } from '../core/io/FileIO';
import type { ImageLayer } from '../core/types';

interface DialogShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** Shared modal shell (portal, backdrop, panel chrome). */
const DialogShell: React.FC<DialogShellProps> = ({ title, onClose, children, footer }) => {
  const content = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-base-100/95 backdrop-blur-xl w-full max-w-sm rounded-none border border-base-content/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header h-9 px-4">
          <h3 className="self-center text-xs font-display uppercase tracking-widest text-base-content/80">{title}</h3>
          <div className="flex-1" />
          <button type="button" className="self-center p-1 text-base-content/60 hover:text-base-content" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="p-4 flex flex-col gap-4">{children}</div>
        <footer className="panel-footer h-11 p-1.5 gap-1.5">{footer}</footer>
      </div>
    </div>
  );
  if (typeof window !== 'undefined' && window.document?.body) {
    return createPortal(content, window.document.body);
  }
  return null;
};

const DimensionInputs: React.FC<{
  width: number;
  height: number;
  onWidth: (w: number) => void;
  onHeight: (h: number) => void;
  /** Keep aspect ratio when one field changes. */
  constrainRatio?: { ratio: number };
}> = ({ width, height, onWidth, onHeight, constrainRatio }) => {
  const clamp = (v: number) => Math.max(1, Math.min(MAX_DIM, Math.round(v) || 1));
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 flex flex-col gap-1 text-2xs font-mono uppercase tracking-wide text-base-content/60">
        Width
        <input
          type="number"
          min={1}
          max={MAX_DIM}
          className="input input-sm input-bordered rounded-none font-mono"
          value={width}
          onChange={(e) => {
            const w = clamp(Number(e.target.value));
            onWidth(w);
            if (constrainRatio) onHeight(clamp(w / constrainRatio.ratio));
          }}
        />
      </label>
      <span className="mt-4 text-base-content/60">×</span>
      <label className="flex-1 flex flex-col gap-1 text-2xs font-mono uppercase tracking-wide text-base-content/60">
        Height
        <input
          type="number"
          min={1}
          max={MAX_DIM}
          className="input input-sm input-bordered rounded-none font-mono"
          value={height}
          onChange={(e) => {
            const h = clamp(Number(e.target.value));
            onHeight(h);
            if (constrainRatio) onWidth(clamp(h * constrainRatio.ratio));
          }}
        />
      </label>
    </div>
  );
};

// ─── Image Size ──────────────────────────────────────────────────────────────

export const ImageSizeDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const doc = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);
  const layer = (doc && activeLayerId ? findLayerById(doc.layers, activeLayerId) : undefined) as ImageLayer | undefined;

  const [width, setWidth] = useState(layer?.transform.size.width ?? doc?.width ?? 1024);
  const [height, setHeight] = useState(layer?.transform.size.height ?? doc?.height ?? 1024);
  const [constrain, setConstrain] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !layer || layer.type !== 'image') return null;

  const ratio = layer.transform.size.width / layer.transform.size.height;
  const current = `${layer.transform.size.width} × ${layer.transform.size.height}`;
  const invalid = width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM;

  const handleApply = async () => {
    if (invalid || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const ok = await LayerManager.resizeLayer(layer.id, width, height);
      if (ok) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <DialogShell
      title="Image Size"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="form-btn flex-1 rounded-none" onClick={onClose} disabled={isWorking}>Cancel</button>
          <button type="button" className="form-btn form-btn-primary flex-1 rounded-none" onClick={() => void handleApply()} disabled={isWorking || invalid}>
            {isWorking ? 'Resizing…' : 'Resize'}
          </button>
        </>
      }
    >
      <p className="text-2xs font-mono text-base-content/60">Resamples the active layer's pixels. Current: {current}px</p>
      <DimensionInputs
        width={width}
        height={height}
        onWidth={setWidth}
        onHeight={setHeight}
        constrainRatio={constrain ? { ratio } : undefined}
      />
      <label className="flex items-center gap-2 text-2xs text-base-content/70 cursor-pointer">
        <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={constrain} onChange={(e) => setConstrain(e.target.checked)} />
        Constrain proportions
      </label>
      <p className="text-2xs font-mono text-base-content/60">Limit: {MAX_DIM}px per side</p>
      {error && <p className="text-2xs font-mono text-error">{error}</p>}
    </DialogShell>
  );
};

// ─── Canvas Size ─────────────────────────────────────────────────────────────

const ANCHORS: Array<{ id: LayerManager.CanvasAnchor; label: string }> = [
  { id: 'top-left', label: '↖' }, { id: 'top', label: '↑' }, { id: 'top-right', label: '↗' },
  { id: 'left', label: '←' }, { id: 'center', label: '·' }, { id: 'right', label: '→' },
  { id: 'bottom-left', label: '↙' }, { id: 'bottom', label: '↓' }, { id: 'bottom-right', label: '↘' },
];

export const CanvasSizeDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const doc = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const [width, setWidth] = useState(doc?.width ?? 1024);
  const [height, setHeight] = useState(doc?.height ?? 1024);
  const [anchor, setAnchor] = useState<LayerManager.CanvasAnchor>('center');
  const [isWorking, setIsWorking] = useState(false);

  if (!isOpen || !doc) return null;

  const invalid = width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM;
  const grows = width > doc.width || height > doc.height;

  const handleApply = async () => {
    if (invalid || isWorking) return;
    setIsWorking(true);
    try {
      const ok = await LayerManager.resizeCanvas(width, height, anchor);
      if (ok) onClose();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <DialogShell
      title="Canvas Size"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="form-btn flex-1 rounded-none" onClick={onClose} disabled={isWorking}>Cancel</button>
          <button type="button" className="form-btn form-btn-primary flex-1 rounded-none" onClick={() => void handleApply()} disabled={isWorking || invalid}>
            {isWorking ? 'Resizing…' : 'Resize'}
          </button>
        </>
      }
    >
      <p className="text-2xs font-mono text-base-content/60">Changes the document bounds without resampling pixels. Current: {doc.width} × {doc.height}px</p>
      <DimensionInputs width={width} height={height} onWidth={setWidth} onHeight={setHeight} />
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-mono uppercase tracking-wide text-base-content/60">Anchor (which edge stays put)</span>
        <div className="grid grid-cols-3 gap-1 w-fit">
          {ANCHORS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={`Anchor ${a.id}`}
              className={`w-8 h-8 flex items-center justify-center text-sm border ${anchor === a.id ? 'border-primary text-primary bg-primary/10' : 'border-base-content/15 text-base-content/60 hover:border-base-content/40'}`}
              onClick={() => setAnchor(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {grows && (
        <p className="text-2xs font-mono text-base-content/60">
          Growing adds transparent padding toward the anchored edge — useful for outpaint prep.
        </p>
      )}
    </DialogShell>
  );
};
