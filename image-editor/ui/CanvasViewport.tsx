// ─── Kollektiv Image Editor — Canvas Viewport ──────────────────────────────
// Hosts the composited EditorCanvas + OverlayCanvas, stacked absolutely.
// Owns the CanvasRenderer instance and exposes zoom/fit controls to
// ImageEditorPage via an imperative handle (renderer internals stay private).

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasRenderer } from '../core/renderer/CanvasRenderer';
import { getSnapshot, subscribe, dispatch as editorDispatch } from '../core/store';
import { findLayerById } from '../core/layers/layerTree';
import { BrushEngine } from '../core/paint/BrushEngine';
import { SelectionEngine } from '../core/selection/SelectionEngine';
import { TransformEngine, getGizmoHandles, hitTestGizmo } from '../core/transform/TransformEngine';
import { TypeTool } from '../core/text/TypeTool';
import { ShapeTool } from '../core/shape/ShapeTool';
import { floodFillFromBitmap } from '../core/selection/FloodFill';
import { GradientTool } from '../core/gradient/GradientTool';
import { CloneStampTool } from '../core/paint/CloneStampTool';
import { docToLayer } from '../core/geometry/docToLayer';
import TypeInput from './TypeInput';
import type { ImageLayer, TextLayer, Layer } from '../core/types';

export interface CanvasViewportHandle {
  fitToViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setWandTolerance: (v: number) => void;
}

interface CanvasViewportProps {
  onCursorMove?: (point: { x: number; y: number } | null) => void;
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)',
  backgroundSize: '16px 16px',
};

/** M5 leftover — topmost text layer whose doc-space bounds contain `pt`, for
 *  double-click re-edit. AABB only: a rotated layer still hits on its
 *  unrotated bounds (acceptable for re-edit hit-testing). */
function findTextLayerAt(layers: Layer[], pt: { x: number; y: number }): TextLayer | null {
  const walk = (list: Layer[]): TextLayer | null => {
    for (let i = 0; i < list.length; i++) {
      const layer = list[i];
      if (layer.type === 'group') {
        const nested = walk(layer.children);
        if (nested) return nested;
      } else if (layer.type === 'text') {
        const { origin, size } = layer.transform;
        if (pt.x >= origin.x && pt.x <= origin.x + size.width &&
            pt.y >= origin.y && pt.y <= origin.y + size.height) return layer;
      }
    }
    return null;
  };
  return walk(layers);
}

const CanvasViewport = forwardRef<CanvasViewportHandle, CanvasViewportProps>(({ onCursorMove }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning,  setIsPanning]  = useState(false);
  const [isTyping,   setIsTyping]   = useState(false);
  const isPanningRef = useRef(false);
  const lastPointerIdRef = useRef<number | null>(null);
  // Magic Wand tolerance — exposed via ToolHeader; module-level ref shared without re-render
  const wandToleranceRef = useRef(32);

  /** Maps a document-space point into the active layer's bitmap space (E1).
   *  Every pixel tool (brush, eraser, clone, mask, wand) stamps into the layer
   *  bitmap, which is rendered through the layer transform — painting doc
   *  coords directly lands in the wrong place on any moved/scaled/rotated/
   *  flipped/cropped layer (review C1). Returns null when the pointer is off
   *  the layer; callers skip the stroke instead of painting a distant corner. */
  const getLayerPoint = (docPt: { x: number; y: number }, layer: ImageLayer): { x: number; y: number } | null =>
    docToLayer(docPt.x, docPt.y, {
      transform: layer.transform,
      intrinsicWidth: layer.intrinsicWidth,
      intrinsicHeight: layer.intrinsicHeight,
    });

  /** Scale factor from doc px to layer bitmap px along the layer's local axes
   *  (uniform per axis is assumed — brush radius uses the mean). */
  const getLayerScale = (layer: ImageLayer): number => {
    const { size } = layer.transform;
    if (size.width <= 0 || size.height <= 0) return 1;
    return (layer.intrinsicWidth / size.width + layer.intrinsicHeight / size.height) / 2;
  };

  // Zoom is only read here to toggle pixelated image-rendering at high zoom —
  // everything else reads the store imperatively inside the renderer.
  const zoomRef = useRef(getSnapshot().viewport.zoom);

  useEffect(() => {
    const canvas = editorCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;

    const renderer = new CanvasRenderer(canvas, overlay);
    rendererRef.current = renderer;
    renderer.start();

    const unsubscribe = subscribe(() => {
      const zoom = getSnapshot().viewport.zoom;
      if (zoom !== zoomRef.current) {
        zoomRef.current = zoom;
        canvas.style.imageRendering = zoom >= 4 ? 'pixelated' : 'auto';
      }
    });

    return () => {
      unsubscribe();
      renderer.stop();
      rendererRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    fitToViewport: () => rendererRef.current?.fitToViewport(),
    zoomIn: () => {
      const canvas = editorCanvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;
      const rect = canvas.getBoundingClientRect();
      renderer.zoomAt(-100, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    zoomOut: () => {
      const canvas = editorCanvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;
      const rect = canvas.getBoundingClientRect();
      renderer.zoomAt(100, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    setWandTolerance: (v: number) => { wandToleranceRef.current = v; },
  }), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' && !(e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) {
        setIsSpaceDown(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    rendererRef.current?.zoomAt(e.deltaY, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { activeTool, activeLayerId, document: doc, viewport } = getSnapshot();
    const renderer = rendererRef.current;
    if (!renderer) return;
    const pt = renderer.getCanvasPoint(e.clientX, e.clientY);

    if (isSpaceDown || activeTool === 'hand') {
      isPanningRef.current = true;
      setIsPanning(true);
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'zoom') {
      renderer.zoomAt(e.altKey ? 100 : -100, e.clientX, e.clientY);
      return;
    }

    lastPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activeTool === 'brush' || activeTool === 'eraser') {
      if (activeLayerId) {
        const layer = findLayerById(doc?.layers ?? [], activeLayerId);
        if (layer?.type === 'image') {
          const layerPt = getLayerPoint(pt, layer);
          if (layerPt) {
            BrushEngine.beginStroke(activeLayerId, getSnapshot().paintTarget, getLayerScale(layer));
            BrushEngine.addPoint(layerPt.x, layerPt.y, e.pressure || 0.5, activeTool === 'eraser');
          }
        }
      }
      return;
    }

    if (activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse') {
      SelectionEngine.beginMarquee(pt.x, pt.y);
      return;
    }

    if (activeTool === 'crop') {
      SelectionEngine.beginCrop(pt.x, pt.y);
      return;
    }

    if (activeTool === 'type') {
      // M5 leftover: double-clicking an existing text layer re-opens the edit
      // box prefilled with its text instead of starting a fresh one.
      if (e.detail === 2 && doc) {
        const hit = findTextLayerAt(doc.layers, pt);
        if (hit) {
          TypeTool.beginEditExisting(hit.id, pt.x, pt.y, () => setIsTyping(false));
          setIsTyping(true);
          return;
        }
      }
      // Begin inline text editing at click position
      TypeTool.beginEdit(pt.x, pt.y, () => setIsTyping(false));
      setIsTyping(true);
      return;
    }

    if ((activeTool === 'shape-rect' || activeTool === 'shape-ellipse') && doc) {
      ShapeTool.setKind(activeTool === 'shape-rect' ? 'rect' : 'ellipse');
      ShapeTool.beginShape(pt.x, pt.y);
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'magic-wand' && activeLayerId && doc) {
      const layer = findLayerById(doc.layers, activeLayerId) as ImageLayer | undefined;
      if (layer?.type === 'image') {
        const layerPt = getLayerPoint(pt, layer);
        if (layerPt) {
          const tolerance = wandToleranceRef.current;
          floodFillFromBitmap(layer.bitmap, layerPt.x, layerPt.y, tolerance, true)
            .then(sel => editorDispatch({ type: 'SET_SELECTION', selection: sel }))
            .catch(console.error);
        }
      }
      return;
    }

    if (activeTool === 'eyedropper' && doc) {
      // Composite all visible layers onto a 1×1 OffscreenCanvas at the click point
      const oc  = new OffscreenCanvas(doc.width, doc.height);
      const ctx2 = oc.getContext('2d')!;
      ;[...doc.layers].reverse().forEach(layer => {
        if (!layer.visible || layer.type !== 'image') return;
        ctx2.save();
        ctx2.globalAlpha = layer.opacity / 100;
        ctx2.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
        ctx2.drawImage(layer.bitmap, layer.transform.origin.x, layer.transform.origin.y,
          layer.transform.size.width, layer.transform.size.height);
        ctx2.restore();
      });
      const px = Math.round(Math.max(0, Math.min(doc.width  - 1, pt.x)));
      const py = Math.round(Math.max(0, Math.min(doc.height - 1, pt.y)));
      const { data } = ctx2.getImageData(px, py, 1, 1);
      const hex = '#' + [data[0], data[1], data[2]]
        .map(v => v.toString(16).padStart(2, '0')).join('');
      editorDispatch({ type: 'SET_COLORS', colors: { foreground: hex } });
      return;
    }

    if (activeTool === 'lasso-freehand') {
      SelectionEngine.beginLasso(pt.x, pt.y);
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'lasso-poly') {
      if (e.detail === 2) {
        // Double-click: close polygon
        SelectionEngine.commitPolyLasso();
      } else if (!SelectionEngine.isPolyActive()) {
        SelectionEngine.beginPolyLasso(pt.x, pt.y);
      } else {
        SelectionEngine.addPolyVertex(pt.x, pt.y);
      }
      return;
    }

    if (activeTool === 'clone-stamp' && activeLayerId) {
      if (e.altKey) {
        const layer = findLayerById(doc?.layers ?? [], activeLayerId);
        const layerPt = layer?.type === 'image' ? getLayerPoint(pt, layer) : null;
        if (layerPt) CloneStampTool.setSource(layerPt.x, layerPt.y, getLayerScale(layer as ImageLayer));
      } else if (CloneStampTool.sourcePoint) {
        const layer = findLayerById(doc?.layers ?? [], activeLayerId);
        if (layer?.type === 'image') {
          const layerPt = getLayerPoint(pt, layer);
          if (layerPt) {
            lastPointerIdRef.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            CloneStampTool.beginStroke(activeLayerId);
            CloneStampTool.addPoint(layerPt.x, layerPt.y, e.pressure || 0.5);
          }
        }
      }
      return;
    }

    if (activeTool === 'gradient') {
      GradientTool.beginGradient(pt.x, pt.y);
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'move' && activeLayerId && doc) {
      // M5 leftover: double-click on a text layer re-opens inline editing
      // (the standard re-edit affordance) before the gizmo takes the click.
      if (e.detail === 2) {
        const hit = findTextLayerAt(doc.layers, pt);
        if (hit) {
          TypeTool.beginEditExisting(hit.id, pt.x, pt.y, () => setIsTyping(false));
          setIsTyping(true);
          return;
        }
      }
      // Gizmo works for every layer type — text and shape transform like image
      // layers (review H9; the old image-only guard made them immovable).
      const layer = findLayerById(doc.layers, activeLayerId);
      if (layer) {
        const canvas = editorCanvasRef.current!;
        const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
        const handles = getGizmoHandles(layer.transform, viewport, cssW, cssH, doc.width, doc.height);
        const cssX = e.clientX - canvas.getBoundingClientRect().left;
        const cssY = e.clientY - canvas.getBoundingClientRect().top;
        const hit = hitTestGizmo({ x: cssX, y: cssY }, handles);
        if (hit) {
          TransformEngine.beginDrag(hit, activeLayerId, pt);
        }
      }
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const pt = renderer.getCanvasPoint(e.clientX, e.clientY);

    // Layer-space point for pixel tools (E1): only computed while a stroke is
    // active, and only when the pointer is inside the layer's bounds.
    const layerPointFor = (layerId: string | null): { x: number; y: number } | null => {
      const doc = getSnapshot().document;
      const layer = doc && layerId ? (findLayerById(doc.layers, layerId) as ImageLayer | undefined) : undefined;
      return layer?.type === 'image' ? getLayerPoint(pt, layer) : null;
    };

    if (isPanningRef.current && lastPointerIdRef.current === e.pointerId) {
      renderer.panBy(e.movementX, e.movementY);
    } else if (BrushEngine.isStroking && lastPointerIdRef.current === e.pointerId) {
      const tool = getSnapshot().activeTool;
      const layerPt = layerPointFor(BrushEngine.activeLayerId);
      if (layerPt) BrushEngine.addPoint(layerPt.x, layerPt.y, e.pressure || 0.5, tool === 'eraser');
    } else if (SelectionEngine.isDragging() && lastPointerIdRef.current === e.pointerId) {
      const tool = getSnapshot().activeTool;
      if (tool === 'marquee-rect' || tool === 'marquee-ellipse') {
        SelectionEngine.updateMarquee(pt.x, pt.y);
      } else if (tool === 'crop') {
        SelectionEngine.updateCrop(pt.x, pt.y);
      } else if (tool === 'shape-rect' || tool === 'shape-ellipse') {
        ShapeTool.updateShape(pt.x, pt.y);
      } else if (tool === 'lasso-freehand') {
        SelectionEngine.addLassoPoint(pt.x, pt.y);
      } else if (tool === 'gradient') {
        GradientTool.updateGradient(pt.x, pt.y);
      }
    } else if (CloneStampTool.isStroking && lastPointerIdRef.current === e.pointerId) {
      const layerPt = layerPointFor(CloneStampTool.activeLayerId);
      if (layerPt) CloneStampTool.addPoint(layerPt.x, layerPt.y, e.pressure || 0.5);
    } else if (TransformEngine.isDragging() && lastPointerIdRef.current === e.pointerId) {
      TransformEngine.updateDrag(pt);
    }

    // Lasso-poly rubber-band always updates on move (no capture needed)
    if (getSnapshot().activeTool === 'lasso-poly') {
      SelectionEngine.updatePolyRubber(pt.x, pt.y);
    }

    const canvas = editorCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      renderer.drawOverlay(e.clientX - rect.left, e.clientY - rect.top);
    }
    onCursorMove?.(pt);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastPointerIdRef.current !== e.pointerId) return;
    const renderer = rendererRef.current;
    const pt = renderer?.getCanvasPoint(e.clientX, e.clientY);

    if (BrushEngine.isStroking) BrushEngine.endStroke();
    if (CloneStampTool.isStroking) CloneStampTool.endStroke();
    if (SelectionEngine.isLassoActive()) SelectionEngine.endLasso();

    if (GradientTool.isDragging() && pt) {
      GradientTool.commitGradient(pt.x, pt.y).catch(console.error);
    }

    if (SelectionEngine.isDragging() && pt) {
      const tool = getSnapshot().activeTool;
      if (tool === 'marquee-rect' || tool === 'marquee-ellipse') {
        SelectionEngine.endMarquee(pt.x, pt.y, tool === 'marquee-rect' ? 'rect' : 'ellipse');
      } else if (tool === 'crop') {
        SelectionEngine.commitCrop(pt.x, pt.y);
      } else if (tool === 'shape-rect' || tool === 'shape-ellipse') {
        ShapeTool.commitShape();
      }
    }

    if (TransformEngine.isDragging()) TransformEngine.endDrag();

    isPanningRef.current = false;
    setIsPanning(false);
    lastPointerIdRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = () => {
    onCursorMove?.(null);
  };

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : isSpaceDown || activeTool === 'hand' ? 'cursor-grab'
    : (activeTool === 'type' || activeTool === 'shape-rect' || activeTool === 'shape-ellipse'
       || activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse'
       || activeTool === 'lasso-freehand' || activeTool === 'lasso-poly'
       || activeTool === 'crop' || activeTool === 'magic-wand'
       || activeTool === 'gradient' || activeTool === 'clone-stamp') ? 'cursor-crosshair'
    : 'cursor-default';

  return (
    <div className="flex-1 overflow-hidden relative bg-base-100">
      <div
        ref={containerRef}
        className={`w-full h-full relative ${cursorClass}`}
        style={CHECKERBOARD_STYLE}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <canvas ref={editorCanvasRef} className="absolute inset-0" />
        <canvas ref={overlayCanvasRef} className="absolute inset-0 pointer-events-none" />
        {isTyping && (
          <TypeInput canvasEl={editorCanvasRef.current} onDone={() => setIsTyping(false)} />
        )}
      </div>
    </div>
  );
});

CanvasViewport.displayName = 'CanvasViewport';

export default CanvasViewport;
