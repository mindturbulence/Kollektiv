// ─── Kollektiv Image Editor — Canvas Viewport ──────────────────────────────
// Hosts the composited EditorCanvas + OverlayCanvas, stacked absolutely.
// Owns the CanvasRenderer instance and exposes zoom/fit controls to
// ImageEditorPage via an imperative handle (renderer internals stay private).

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasRenderer } from '../core/renderer/CanvasRenderer';
import { getSnapshot, subscribe, dispatch as editorDispatch } from '../core/store';
import { BrushEngine } from '../core/paint/BrushEngine';
import { SelectionEngine } from '../core/selection/SelectionEngine';
import { TransformEngine, getGizmoHandles, hitTestGizmo } from '../core/transform/TransformEngine';
import { TypeTool } from '../core/text/TypeTool';
import { ShapeTool } from '../core/shape/ShapeTool';
import { floodFillFromBitmap } from '../core/selection/FloodFill';
import TypeInput from './TypeInput';
import type { ImageLayer } from '../core/types';

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
        BrushEngine.beginStroke(activeLayerId);
        BrushEngine.addPoint(pt.x, pt.y, e.pressure || 0.5, activeTool === 'eraser');
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
      const layer = doc.layers.find(l => l.id === activeLayerId) as ImageLayer | undefined;
      if (layer?.type === 'image') {
        const tolerance = wandToleranceRef.current;
        floodFillFromBitmap(layer.bitmap, pt.x, pt.y, tolerance, true)
          .then(sel => editorDispatch({ type: 'SET_SELECTION', selection: sel }))
          .catch(console.error);
      }
      return;
    }

    if (activeTool === 'move' && activeLayerId && doc) {
      const layer = doc.layers.find(l => l.id === activeLayerId);
      if (layer && layer.type === 'image') {
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

    if (isPanningRef.current && lastPointerIdRef.current === e.pointerId) {
      renderer.panBy(e.movementX, e.movementY);
    } else if (BrushEngine.isStroking && lastPointerIdRef.current === e.pointerId) {
      const tool = getSnapshot().activeTool;
      BrushEngine.addPoint(pt.x, pt.y, e.pressure || 0.5, tool === 'eraser');
    } else if (SelectionEngine.isDragging() && lastPointerIdRef.current === e.pointerId) {
      const tool = getSnapshot().activeTool;
      if (tool === 'marquee-rect' || tool === 'marquee-ellipse') {
        SelectionEngine.updateMarquee(pt.x, pt.y);
      } else if (tool === 'crop') {
        SelectionEngine.updateCrop(pt.x, pt.y);
      } else if (tool === 'shape-rect' || tool === 'shape-ellipse') {
        ShapeTool.updateShape(pt.x, pt.y);
      }
    } else if (TransformEngine.isDragging() && lastPointerIdRef.current === e.pointerId) {
      TransformEngine.updateDrag(pt);
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

    if (SelectionEngine.isDragging() && pt) {
      const tool = getSnapshot().activeTool;
      if (tool === 'marquee-rect' || tool === 'marquee-ellipse') {
        SelectionEngine.endMarquee(pt.x, pt.y, tool === 'marquee-rect' ? 'rect' : 'ellipse');
      } else if (tool === 'crop') {
        SelectionEngine.commitCrop(pt.x, pt.y);
      } else if ((tool === 'shape-rect' || tool === 'shape-ellipse') && pt) {
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
    : isSpaceDown || activeTool === 'hand'
      ? 'cursor-grab'
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
