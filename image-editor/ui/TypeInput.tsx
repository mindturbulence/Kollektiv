// ─── Kollektiv Image Editor — TypeInput ──────────────────────────────────────
// Transparent <textarea> overlay that appears at the cursor position when the
// Type tool is active and the user clicks the canvas.
// Positioned in document space but rendered in CSS px via docToCanvas().

import React, { useEffect, useRef } from 'react';
import { TypeTool } from '../core/text/TypeTool';
import { docToCanvas } from '../core/transform/TransformEngine';
import { getSnapshot } from '../core/store';
import { findLayerById } from '../core/layers/layerTree';

interface TypeInputProps {
  /** Canvas element reference — used to compute CSS position. */
  canvasEl: HTMLCanvasElement | null;
  onDone: () => void;
}

const TypeInput: React.FC<TypeInputProps> = ({ canvasEl, onDone }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  if (!TypeTool.isEditing || !canvasEl) return null;

  const { viewport, document: doc } = getSnapshot();
  const { x: docX, y: docY }        = TypeTool.clickPos;
  const s                           = TypeTool.settings;

  const rect  = canvasEl.getBoundingClientRect();
  const cssPos = docToCanvas(docX, docY, viewport, rect.width, rect.height, doc?.width ?? 1, doc?.height ?? 1);

  // Re-edit (M5 leftover): prefill the box with the layer's current text so a
  // double-click edits in place instead of starting empty.
  const existingId  = TypeTool.existingLayerId;
  const existing    = existingId && doc
    ? findLayerById(doc.layers, existingId)
    : undefined;
  const initialText = existing?.type === 'text' ? existing.text : '';

  // Scale font size to canvas zoom
  const scaledFont = Math.max(8, s.fontSize * viewport.zoom);

  const commit = () => {
    TypeTool.commit(textareaRef.current?.value ?? '');
    onDone();
  };

  return (
    <textarea
      ref={textareaRef}
      className="absolute pointer-events-auto resize-none"
      style={{
        left:            cssPos.x,
        top:             cssPos.y,
        transform:       'translate(-50%, -50%)',
        minWidth:        120,
        minHeight:       scaledFont * 1.5,
        background:      'transparent',
        border:          '1px dashed rgba(192,240,76,0.6)',
        outline:         'none',
        color:           s.color,
        font:            `${s.fontWeight} ${scaledFont}px "${s.fontFamily}", sans-serif`,
        caretColor:      s.color,
        lineHeight:      1.25,
        padding:         '2px 4px',
        whiteSpace:      'pre',
        overflow:        'hidden',
        zIndex:          50,
      }}
      defaultValue={initialText}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { TypeTool.cancel(); onDone(); }
        // Ctrl/Cmd+Enter commits
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
      }}
      // Auto-grow height as user types
      onChange={(e) => {
        const ta = e.currentTarget;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      }}
    />
  );
};

export default TypeInput;
