// ─── Kollektiv Image Editor — Export Modal ───────────────────────────────────

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { exportToBlob } from '../core/io/FileIO';
import { getSnapshot } from '../core/store';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const [format,     setFormat]     = useState<'png' | 'jpeg'>('png');
  const [quality,    setQuality]    = useState(92);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    const doc = getSnapshot().document;
    if (!doc) return;
    setIsExporting(true);
    try {
      const blob = await exportToBlob(doc, format, quality);
      const url  = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href     = url;
      link.download = `${doc.title || 'untitled'}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-base-300 border border-base-content/10 shadow-2xl w-80"
        onClick={e => e.stopPropagation()}
      >
        <header className="panel-header h-9 px-3 flex items-center">
          <h2 className="text-[10px] font-display uppercase tracking-widest text-base-content/70">Export</h2>
        </header>

        <div className="p-4 space-y-4">
          {/* Format */}
          <div>
            <p className="text-[10px] font-mono text-base-content/50 uppercase tracking-widest mb-2">Format</p>
            <div className="flex gap-2">
              {(['png', 'jpeg'] as const).map(f => (
                <button key={f} type="button"
                  className={`flex-1 py-1.5 text-[10px] font-mono uppercase border ${format === f ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
                  onClick={() => setFormat(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Quality (JPEG only) */}
          {format === 'jpeg' && (
            <label className="flex items-center gap-3 text-[10px] font-mono text-base-content/60">
              <span className="w-14 flex-shrink-0">Quality</span>
              <input type="range" className="range range-xs range-primary flex-1" min={1} max={100} value={quality}
                onChange={e => setQuality(Number(e.target.value))} />
              <span className="w-8 text-right">{quality}%</span>
            </label>
          )}

          {/* Alpha warning for JPEG */}
          {format === 'jpeg' && (
            <p className="text-[9px] font-mono text-warning/70">
              ⚠ JPEG does not support transparency — alpha channel will be flattened to white.
            </p>
          )}
        </div>

        <footer className="panel-footer h-9 flex items-center justify-end gap-2 px-3">
          <button type="button" className="form-btn rounded-none text-xs h-7 px-3" onClick={onClose}>Cancel</button>
          <button type="button" className="form-btn form-btn-primary rounded-none text-xs h-7 px-3"
            disabled={isExporting} onClick={handleDownload}>
            {isExporting ? 'Exporting…' : 'Download'}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, window.document.body);
};

export default ExportModal;
