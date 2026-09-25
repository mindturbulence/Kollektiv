// ─── Kollektiv Image Editor — FloatingPanel ──────────────────────────────────
// Generic draggable + resizable floating panel. No windowing library.
// Uses pointermove/pointerup on window for drag/resize.

import React, { useRef, useState } from 'react';
import { CloseIcon } from '../../components/icons';

interface FloatingPanelProps {
  title: string;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  defaultX = 200,
  defaultY = 100,
  defaultWidth = 360,
  defaultHeight = 320,
  onClose,
  children,
  footer,
}) => {
  const [pos,  setPos]  = useState({ x: defaultX, y: defaultY });
  const [size, setSize] = useState({ w: defaultWidth, h: defaultHeight });

  const dragRef   = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; ow: number; oh: number } | null>(null);

  const onTitlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.ox + ev.clientX - dragRef.current.startX,
        y: dragRef.current.oy + ev.clientY - dragRef.current.startY,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, ow: size.w, oh: size.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(200, resizeRef.current.ow + ev.clientX - resizeRef.current.startX),
        h: Math.max(160, resizeRef.current.oh + ev.clientY - resizeRef.current.startY),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="fixed bg-base-300 border border-base-content/10 shadow-2xl flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 100 }}
    >
      {/* Title bar */}
      <div
        className="h-9 flex-shrink-0 flex items-center px-3 bg-base-100/90 border-b border-base-content/10 cursor-move select-none"
        onPointerDown={onTitlePointerDown}
      >
        <span className="flex-1 text-2xs font-display uppercase tracking-widest text-base-content/70">
          {title}
        </span>
        <button
          type="button"
          className="p-1 text-base-content/50 hover:text-base-content"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 min-h-0">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="panel-footer h-9 flex items-center justify-end gap-2 px-3 flex-shrink-0 border-t border-base-content/5">
          {footer}
        </div>
      )}

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{ touchAction: 'none' }}
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
};

export default FloatingPanel;
