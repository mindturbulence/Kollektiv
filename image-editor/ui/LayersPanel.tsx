// ─── Kollektiv Image Editor — Layers Panel ─────────────────────────────────
// Flat list + one level of GroupLayer nesting, 252px default width,
// resizable via a 4px left-edge drag handle persisted to localStorage.
//
// Grouping is V1-scoped: only top-level layers can be grouped/ungrouped, and
// group opacity/blend mode aren't composited as a unit yet (CanvasRenderer
// draws children straight through) — grouping is organizational for now.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import type { Layer, BlendMode } from '../core/types';
import { NATIVE_BLEND_MODES } from '../core/types';
import { MANUAL_BLEND_MODES } from '../core/renderer/BlendCompositor';
import { importImage, openFilePicker } from '../core/io/FileIO';
import { getThumbnail } from '../core/thumbnails/ThumbnailCache';
import { findLayerById } from '../core/layers/layerTree';
import * as LayerManager from '../core/layers/LayerManager';
import {
  EyeIcon, PlusIcon, DeleteIcon, LockIcon, LockOpenIcon, PhotoIcon,
  FolderClosedIcon, FolderOpenIcon, ChevronRightIcon, ChevronDownIcon,
} from '../../components/icons';

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 252;
const STORAGE_KEY = 'imageEditor.layersPanelWidth';

interface FlatRow {
  layer: Layer;
  depth: number;
  parentId: string | null;
}

/** Flattens the (at most 1-level-deep) layer tree for row rendering, skipping
 *  children of collapsed groups. */
function flattenTree(layers: Layer[], expandedIds: Set<string>, depth = 0, parentId: string | null = null): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const layer of layers) {
    rows.push({ layer, depth, parentId });
    if (layer.type === 'group' && expandedIds.has(layer.id)) {
      rows.push(...flattenTree(layer.children, expandedIds, depth + 1, layer.id));
    }
  }
  return rows;
}

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

  if (layer.type === 'group') {
    return (
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-base-content/60">
        {/* Rendered by the caller (open/closed depends on expand state) */}
      </div>
    );
  }

  if (layer.type !== 'image') {
    return (
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center border border-base-content/10 bg-base-300 text-base-content/60">
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
  depth: number;
  active: boolean;
  selected: boolean;
  isDragOver: boolean;
  isExpanded: boolean;
  paintingMask: boolean;
  onToggleExpand: () => void;
  onSelect: (id: string, modifiers: { shift: boolean; ctrlOrMeta: boolean }) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDrop: () => void;
}> = ({ layer, depth, active, selected, isDragOver, isExpanded, paintingMask, onToggleExpand, onSelect, onDragStart, onDragEnter, onDrop }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);
  const isGroup = layer.type === 'group';

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
      draggable={depth === 0}
      className={`h-7 flex-shrink-0 flex items-center gap-1.5 px-1.5 border-b cursor-default select-none ${
        active ? 'bg-primary/10' : selected ? 'bg-primary/5' : 'hover:bg-base-content/5'
      } ${isDragOver ? 'border-t-2 border-t-primary border-base-content/5' : 'border-base-content/5'}`}
      style={{ paddingLeft: 6 + depth * 14 }}
      onClick={(e) => onSelect(layer.id, { shift: e.shiftKey, ctrlOrMeta: e.ctrlKey || e.metaKey })}
      onDragStart={() => onDragStart(layer.id)}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(layer.id); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      {isGroup ? (
        <button
          type="button"
          className="flex-shrink-0 p-0.5 text-base-content/60 hover:text-base-content"
          aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        >
          {isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
        </button>
      ) : (
        <button
          type="button"
          className="flex-shrink-0 p-0.5 text-base-content/60 hover:text-base-content"
          aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
          onClick={(e) => { e.stopPropagation(); LayerManager.setLayerVisibility(layer.id, !layer.visible); }}
        >
          <EyeIcon className={`w-3.5 h-3.5 ${layer.visible ? '' : 'opacity-30'}`} />
        </button>
      )}

      {isGroup ? (
        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-base-content/60">
          {isExpanded ? <FolderOpenIcon className="w-3.5 h-3.5" /> : <FolderClosedIcon className="w-3.5 h-3.5" />}
        </div>
      ) : (
        <LayerThumbnail layer={layer} />
      )}

      {layer.type === 'image' && (
        layer.mask ? (
          <button
            type="button"
            className={`flex-shrink-0 w-4 h-4 border ${paintingMask ? 'border-primary ring-1 ring-primary' : 'border-base-content/20'}`}
            style={{
              backgroundImage: 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)',
              backgroundSize: '6px 6px',
            }}
            aria-label="Paint mask"
            title="Click to paint this mask. Right-click to remove it."
            onClick={(e) => {
              e.stopPropagation();
              onSelect(layer.id, { shift: false, ctrlOrMeta: false });
              dispatch({ type: 'SET_PAINT_TARGET', target: 'mask' });
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); LayerManager.removeMask(layer.id); }}
          />
        ) : (
          <button
            type="button"
            className="flex-shrink-0 px-0.5 text-2xs font-mono leading-none text-base-content/60 hover:text-base-content/70"
            aria-label="Add mask"
            title="Add mask"
            onClick={(e) => { e.stopPropagation(); void LayerManager.addMask(layer.id); }}
          >
            +M
          </button>
        )
      )}

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

      {isGroup ? (
        <button
          type="button"
          className="flex-shrink-0 p-0.5 text-base-content/60 hover:text-base-content/80"
          aria-label="Ungroup"
          title="Ungroup"
          onClick={(e) => { e.stopPropagation(); LayerManager.ungroupLayer(layer.id); }}
        >
          <FolderOpenIcon className="w-3 h-3" />
        </button>
      ) : (
        <button
          type="button"
          className="flex-shrink-0 p-0.5 text-base-content/60 hover:text-base-content/80"
          aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { locked: !layer.locked } }); }}
        >
          {layer.locked ? <LockIcon className="w-3 h-3" /> : <LockOpenIcon className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};

const LayersPanel: React.FC = () => {
  const document = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);
  const paintTarget = useSyncExternalStore(subscribe, () => getSnapshot().paintTarget);

  const [width, setWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const parsed = stored ? Number(stored) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed)) : DEFAULT_WIDTH;
  });
  const isResizingRef = useRef(false);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  // H8: opacity value when the current drag/keyboard edit started.
  const opacityBeforeDragRef = useRef<number | null>(null);

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

  const layers = document?.layers ?? [];
  const rows = flattenTree(layers, expandedIds);
  const activeLayer = activeLayerId ? findLayerById(layers, activeLayerId) : null;
  const activeLayerIsGroup = activeLayer?.type === 'group';

  const handleSelect = (id: string, modifiers: { shift: boolean; ctrlOrMeta: boolean }) => {
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: id });
    // SET_ACTIVE_LAYER already resets paintTarget to 'color' when the layer changes,
    // but clicking the row body of the ALREADY-active layer is a no-op there — so
    // clicking anywhere except the mask chip explicitly returns to color painting.
    dispatch({ type: 'SET_PAINT_TARGET', target: 'color' });

    if (modifiers.ctrlOrMeta) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      lastClickedRef.current = id;
      return;
    }

    if (modifiers.shift && lastClickedRef.current) {
      const topLevelIds = layers.map((l) => l.id);
      const fromIdx = topLevelIds.indexOf(lastClickedRef.current);
      const toIdx = topLevelIds.indexOf(id);
      if (fromIdx >= 0 && toIdx >= 0) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        setSelectedIds(new Set(topLevelIds.slice(lo, hi + 1)));
        return;
      }
    }

    setSelectedIds(new Set([id]));
    lastClickedRef.current = id;
  };

  // H11: "+" creates a transparent blank layer (the standard touch-up /
  // inpaint-mask workflow); importing an image got its own button.
  const handleAddLayer = () => {
    void LayerManager.addBlankLayer();
  };

  const handlePlaceImage = async () => {
    const file = await openFilePicker();
    if (!file) return;
    const layer = await importImage(file);
    LayerManager.addLayer(layer);
  };

  const handleDuplicateLayer = () => {
    if (activeLayerId) LayerManager.duplicateLayer(activeLayerId);
  };

  const handleMergeDown = () => {
    void LayerManager.mergeDown().then((ok) => {
      if (!ok) showMergeHint();
    });
  };

  const handleFlatten = () => {
    void LayerManager.flattenImage();
  };

  /** No toast host in this panel — hint via the disabled merge button state.
   *  Kept as a named no-op so the failure path is explicit, not silent. */
  const showMergeHint = () => {};

  const handleDeleteLayer = () => {
    // Nested-aware (H12): removeLayer locates the layer anywhere in the tree.
    LayerManager.removeActiveLayer();
  };

  const handleGroup = () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : activeLayerId ? [activeLayerId] : [];
    // V1 scope: only top-level layers can be grouped.
    const topLevelIds = new Set(layers.map((l) => l.id));
    const groupable = ids.filter((id) => topLevelIds.has(id));
    if (groupable.length === 0) return;
    LayerManager.groupLayers(groupable);
    const newGroupId = getSnapshot().activeLayerId;
    if (newGroupId) setExpandedIds((prev) => new Set(prev).add(newGroupId));
    setSelectedIds(new Set());
  };

  const canGroup = (selectedIds.size > 0 || !!activeLayerId) &&
    [...(selectedIds.size > 0 ? selectedIds : activeLayerId ? [activeLayerId] : [])]
      .every((id) => layers.some((l) => l.id === id));

  // Merge-down needs an active TOP-LEVEL layer with a non-group layer beneath.
  const activeTopLevelIndex = activeLayerId ? layers.findIndex(l => l.id === activeLayerId) : -1;
  const canMergeDown = activeTopLevelIndex >= 0 &&
    activeTopLevelIndex < layers.length - 1 &&
    layers[activeTopLevelIndex + 1].type !== 'group';

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
          <h3 className="self-center text-2xs font-display uppercase tracking-widest text-base-content/70">
            Layers
          </h3>
        </header>

        <div className="px-3 py-2 flex flex-col gap-2 border-b border-base-content/5">
          <select
            className="select select-xs select-bordered rounded-none font-mono"
            value={activeLayer?.blendMode ?? 'normal'}
            disabled={!activeLayer || activeLayerIsGroup}
            title={activeLayerIsGroup ? 'Group blend mode is not composited yet — applies per-child' : undefined}
            onChange={(e) =>
              activeLayerId &&
              LayerManager.setLayerBlendMode(activeLayerId, e.target.value as BlendMode)
            }
          >
            <optgroup label="Native">
              {NATIVE_BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </optgroup>
            <optgroup label="Manual (GPU)">
              {MANUAL_BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </optgroup>
          </select>
          <label className="flex items-center gap-2 text-2xs font-mono text-base-content/60">
            Opacity
            <input
              type="range"
              className="range range-xs range-primary flex-1"
              min={0}
              max={100}
              value={activeLayer?.opacity ?? 100}
              disabled={!activeLayer || activeLayerIsGroup}
              // H8: drag live WITHOUT history (a drag used to push dozens of
              // commands and evict real undo history), then ONE command on
              // commit (pointerup / key release).
              onPointerDown={(e) => {
                opacityBeforeDragRef.current = activeLayer?.opacity ?? 100;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onChange={(e) =>
                activeLayerId &&
                LayerManager.setLayerOpacityLive(activeLayerId, Number(e.target.value))
              }
              onPointerUp={() => {
                if (activeLayerId && opacityBeforeDragRef.current !== null) {
                  LayerManager.commitLayerOpacity(activeLayerId, opacityBeforeDragRef.current);
                  opacityBeforeDragRef.current = null;
                }
              }}
              onKeyDown={() => {
                if (opacityBeforeDragRef.current === null) {
                  opacityBeforeDragRef.current = activeLayer?.opacity ?? 100;
                }
              }}
              onBlur={() => {
                if (activeLayerId && opacityBeforeDragRef.current !== null) {
                  LayerManager.commitLayerOpacity(activeLayerId, opacityBeforeDragRef.current);
                  opacityBeforeDragRef.current = null;
                }
              }}
            />
            <span className="w-8 text-right">{activeLayerIsGroup ? '—' : `${activeLayer?.opacity ?? 100}%`}</span>
          </label>
        </div>
        <div
          className="flex-1 overflow-y-auto min-h-0"
          onDragEnd={() => { setDragLayerId(null); setDragOverLayerId(null); }}
        >
          {rows.map(({ layer, depth }) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              depth={depth}
              active={layer.id === activeLayerId}
              selected={selectedIds.has(layer.id)}
              isDragOver={layer.id === dragOverLayerId && dragLayerId !== layer.id}
              isExpanded={expandedIds.has(layer.id)}
              paintingMask={layer.id === activeLayerId && paintTarget === 'mask'}
              onToggleExpand={() => setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id);
                return next;
              })}
              onSelect={handleSelect}
              onDragStart={(id) => setDragLayerId(id)}
              onDragEnter={(id) => setDragOverLayerId(id)}
              onDrop={() => {
                if (!dragLayerId || !dragOverLayerId || dragLayerId === dragOverLayerId || !document) return;
                // Top-level drag-reorder only (children are not draggable — see `draggable={depth === 0}`).
                const topLevel = document.layers;
                const fromIdx = topLevel.findIndex(l => l.id === dragLayerId);
                const toIdx = topLevel.findIndex(l => l.id === dragOverLayerId);
                if (fromIdx < 0 || toIdx < 0) return;
                const newOrder = topLevel.map(l => l.id);
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
            aria-label="New blank layer"
            title="New blank layer"
            disabled={!document}
            onClick={handleAddLayer}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-primary disabled:opacity-30"
            aria-label="Place image as layer"
            title="Place image as layer"
            disabled={!document}
            onClick={() => void handlePlaceImage()}
          >
            <PhotoIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-primary disabled:opacity-30"
            aria-label="Duplicate layer"
            title="Duplicate layer"
            disabled={!activeLayer || activeLayerIsGroup}
            onClick={handleDuplicateLayer}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="9" width="11" height="11" rx="1" />
              <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
            </svg>
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-primary disabled:opacity-30"
            aria-label="Group selected layers"
            title="Group selected layers"
            disabled={!canGroup}
            onClick={handleGroup}
          >
            <FolderClosedIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center text-base-content/60 hover:text-error disabled:opacity-30"
            aria-label="Delete layer"
            title="Delete layer"
            disabled={!activeLayerId}
            onClick={handleDeleteLayer}
          >
            <DeleteIcon className="w-4 h-4" />
          </button>
        </footer>
        <div className="h-7 flex-shrink-0 flex items-center gap-1 px-1 border-t border-base-content/5">
          <button
            type="button"
            className="flex-1 px-1 py-0.5 text-2xs font-mono uppercase tracking-wide text-base-content/60 hover:text-primary border border-base-content/15 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Merge down"
            title="Merge the active layer into the one beneath it"
            disabled={!activeLayer || activeLayerIsGroup || !canMergeDown}
            onClick={handleMergeDown}
          >
            Merge down
          </button>
          <button
            type="button"
            className="flex-1 px-1 py-0.5 text-2xs font-mono uppercase tracking-wide text-base-content/60 hover:text-primary border border-base-content/15 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Flatten image"
            title="Flatten all layers into one background"
            disabled={!document || layers.length < 2}
            onClick={handleFlatten}
          >
            Flatten
          </button>
        </div>
      </div>
    </div>
  );
};

export default LayersPanel;
