// ─── Kollektiv Image Editor — Layers Panel ─────────────────────────────────
// M1-simplified: flat layer list (no groups/masks), 252px default width,
// resizable via a 4px left-edge drag handle persisted to localStorage.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import type { Layer, BlendMode } from '../core/types';
import { NATIVE_BLEND_MODES } from '../core/types';
import { importImage, openFilePicker } from '../core/io/FileIO';
import { getThumbnail } from '../core/thumbnails/ThumbnailCache';
import * as LayerManager from '../core/layers/LayerManager';
import { EyeIcon, PlusIcon, DeleteIcon, LockIcon, LockOpenIcon, PhotoIcon } from '../../components/icons';

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 252;
const STORAGE_KEY = 'imageEditor.layersPanelWidth';

const LayerThumbnail: React.FC<{ layer: Layer }> = ({ layer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-draws once the cache finishes regenerating (dirtyLayerIds no longer has this id).
  const isPendingRegen = useSyncExternalStore(subscribe, () => getSnapshot().dirtyLayerIds.has(layer.id));

  useEffect(() => {
    if (layer.type !== 'image') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const source = getThumbnail(layer.id) ?? layer.bitmap;
    if (!canvas || !ctx || !source || source.width === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
    const w = source.width * scale;
    const h = source.height * scale;
    ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }, [layer, isPendingRegen]);

  if (layer.type !== 'image') {
    return (
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center border border-base-content/10 bg-base-300 text-base-content/40">
        <PhotoIcon className="w-3.5 h-3.5" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={24}
      height={24}
      className="w-6 h-6 flex-shrink-0 border border-base-content/10"
      style={{
        backgroundImage: 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)',
        backgroundSize: '8px 8px',
      }}
    />
  );
};

const LayerRow: React.FC<{
  layer: Layer;
  active: boolean;
  isDragOver: boolean;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDrop: () => void;
}> = ({ layer, active, isDragOver, onDragStart, onDragEnter, onDrop }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);

  const commitRename = () => {
    setIsRenaming(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== layer.name) {
      LayerManager.renameLayer(layer.id, trimmed);
    } else {
      setDraftName(layer.name);
    }
  };

  return (
    <div
      draggable
      className={`h-7 flex-shrink-0 flex items-center gap-1.5 px-1.5 border-b cursor-default select-none ${
        active ? 'bg-primary/10' : 'hover:bg-base-content/5'
      } ${isDragOver ? 'border-t-2 border-t-primary border-base-content/5' : 'border-base-content/5'}`}
      onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', layerId: layer.id })}
      onDragStart={() => onDragStart(layer.id)}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(layer.id); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <button
        type="button"
        className="flex-shrink-0 p-0.5 text-base-content/60 hover:text-base-content"
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={(e) => { e.stopPropagation(); LayerManager.setLayerVisibility(layer.id, !layer.visible); }}
      >
        <EyeIcon className={`w-3.5 h-3.5 ${layer.visible ? '' : 'opacity-30'}`} />
      </button>

      <LayerThumbnail layer={layer} />

      {isRenaming ? (
        <input
          autoFocus
          className="flex-1 min-w-0 bg-transparent border-b border-primary/50 text-xs font-mono outline-none"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraftName(layer.name); setIsRenaming(false); }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-xs font-mono truncate"
          onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); setDraftName(layer.name); }}
        >
          {layer.name}
        </span>
      )}

      <button
        type="button"
        className="flex-shrink-0 p-0.5 text-base-content/40 hover:text-base-content/80"
        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { locked: !layer.locked } }); }}
      >
        {layer.locked ? <LockIcon className="w-3 h-3" /> : <LockOpenIcon className="w-3 h-3" />}
      </button>
    </div>
  );
};

const LayersPanel: React.FC = () => {
  const document = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);

  const [width, setWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const parsed = stored ? Number(stored) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed)) : DEFAULT_WIDTH;
  });
  const isResizingRef = useRef(false);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const handlePointerUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      window.localStorage.setItem(STORAGE_KEY, String(width));
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [width]);

  const activeLayer = document?.layers.find((l) => l.id === activeLayerId) ?? null;

  const handleAddLayer = async () => {
    const file = await openFilePicker();
    if (!file) return;
    const layer = await importImage(file);
    LayerManager.addLayer(layer);
  };

  const handleDeleteLayer = () => {
    LayerManager.removeActiveLayer();
  };

  return (
    <div className="relative flex-shrink-0 flex bg-base-200" style={{ width }}>
      <div
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/30 z-10"
        onPointerDown={(e) => {
          e.preventDefault();
          isResizingRef.current = true;
        }}
      />
      <div className="flex-1 flex flex-col min-w-0 border-l border-base-content/5">
        <header className="panel-header h-9 px-3 flex-shrink-0">
          <h3 className="self-center text-[10px] font-display uppercase tracking-widest text-base-content/70">
            Layers
          </h3>
        </header>

        <div className="px-3 py-2 flex flex-col gap-2 border-b border-base-content/5">
          <select
            className="select select-xs select-bordered rounded-none font-mono"
            value={activeLayer?.blendMode ?? 'normal'}
            disabled={!activeLayer}
            onChange={(e) =>
              activeLayerId &&
              LayerManager.setLayerBlendMode(activeLayerId, e.target.value as BlendMode)
            }
          >
            {NATIVE_BLEND_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[10px] font-mono text-base-content/60">
            Opacity
            <input
              type="range"
              className="range range-xs range-primary flex-1"
              min={0}
              max={100}
              value={activeLayer?.opacity ?? 100}
              disabled={!activeLayer}
              onChange={(e) =>
                activeLayerId &&
                LayerManager.setLayerOpacity(activeLayerId, Number(e.target.value))
              }
            />
            <span className="w-8 text-right">{activeLayer?.opacity ?? 100}%</span>
          </label>
        </div>
        <div
          className="flex-1 overflow-y-auto min-h-0"
          onDragEnd={() => { setDragLayerId(null); setDragOverLayerId(null); }}
        >
          {document?.layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              active={layer.id === activeLayerId}
              isDragOver={layer.id === dragOverLayerId && dragLayerId !== layer.id}
              onDragStart={(id) => setDragLayerId(id)}
              onDragEnter={(id) => setDragOverLayerId(id)}
              onDrop={() => {
                if (!dragLayerId || !dragOverLayerId || dragLayerId === dragOverLayerId || !document) return;
                const layers = document.layers;
                const fromIdx = layers.findIndex(l => l.id === dragLayerId);
                const toIdx = layers.findIndex(l => l.id === dragOverLayerId);
                if (fromIdx < 0 || toIdx < 0) return;
                const newOrder = layers.map(l => l.id);
                newOrder.splice(fromIdx, 1);
                newOrder.splice(toIdx, 0, dragLayerId);
                LayerManager.reorderLayers(newOrder);
                setDragLayerId(null);
                setDragOverLayerId(null);
              }}
            />
          ))}
        </div>

        <footer className="panel-footer h-9 p-1 gap-1 flex-shrink-0">
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-primary"
            aria-label="Add layer"
            onClick={handleAddLayer}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-error disabled:opacity-30"
            aria-label="Delete layer"
            disabled={!activeLayerId}
            onClick={handleDeleteLayer}
          >
            <DeleteIcon className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </div>
  );
};

export default LayersPanel;
