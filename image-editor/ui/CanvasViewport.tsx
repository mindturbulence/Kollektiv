// ─── Kollektiv Image Editor — Canvas Viewport ──────────────────────────────
// Hosts the composited EditorCanvas + OverlayCanvas, stacked absolutely.
// Owns the CanvasRenderer instance and exposes zoom/fit controls to
// ImageEditorPage via an imperative handle (renderer internals stay private).

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasRenderer } from '../core/renderer/CanvasRenderer';
import { getSnapshot, subscribe } from '../core/store';
import { BrushEngine } from '../core/paint/BrushEngine';

export interface CanvasViewportHandle {
  fitToViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
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
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPointerIdRef = useRef<number | null>(null);

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
    const { activeTool, activeLayerId } = getSnapshot();
    if (isSpaceDown || activeTool === 'hand') {
      isPanningRef.current = true;
      setIsPanning(true);
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if ((activeTool === 'brush' || activeTool === 'eraser') && activeLayerId) {
      lastPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = rendererRef.current?.getCanvasPoint(e.clientX, e.clientY);
      if (pt) {
        BrushEngine.beginStroke(activeLayerId);
        BrushEngine.addPoint(pt.x, pt.y, e.pressure || 0.5, activeTool === 'eraser');
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isPanningRef.current && lastPointerIdRef.current === e.pointerId) {
      renderer.panBy(e.movementX, e.movementY);
    } else if (BrushEngine.isStroking && lastPointerIdRef.current === e.pointerId) {
      const pt = renderer.getCanvasPoint(e.clientX, e.clientY);
      const tool = getSnapshot().activeTool;
      BrushEngine.addPoint(pt.x, pt.y, e.pressure || 0.5, tool === 'eraser');
    }

    const canvas = editorCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      renderer.drawOverlay(e.clientX - rect.left, e.clientY - rect.top);
    }
    onCursorMove?.(renderer.getCanvasPoint(e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastPointerIdRef.current === e.pointerId) {
      if (BrushEngine.isStroking) BrushEngine.endStroke();
      isPanningRef.current = false;
      setIsPanning(false);
      lastPointerIdRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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
      </div>
    </div>
  );
});

CanvasViewport.displayName = 'CanvasViewport';

export default CanvasViewport;
