// ─── Kollektiv Image Editor — New Document Modal ───────────────────────────
// Blank canvas creation. DaisyUI modal chrome matching AddItemModal/
// ConfirmationModal (backdrop blur, centered card, portal-rendered).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../components/icons';

type Background = 'white' | 'transparent' | 'foreground';

interface Preset {
  label: string;
  width: number;
  height: number;
}

const PRESETS: Preset[] = [
  { label: '1024 × 1024', width: 1024, height: 1024 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '512 × 512', width: 512, height: 512 },
];

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number, background: Background) => void | Promise<void>;
}

const NewDocumentModal: React.FC<NewDocumentModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [background, setBackground] = useState<Background>('white');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (width < 1 || height < 1 || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(Math.round(width), Math.round(height), background);
    } finally {
      setIsCreating(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-document-title"
    >
      <div
        className="bg-base-100/95 backdrop-blur-xl w-full max-w-md rounded-none border border-base-content/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header h-9 px-4">
          <h3 id="new-document-title" className="self-center text-xs font-display uppercase tracking-widest text-base-content/80">
            New Document
          </h3>
          <div className="flex-1" />
          <button type="button" className="self-center p-1 text-base-content/50 hover:text-base-content" onClick={onClose} aria-label="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <label className="flex-1 flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wide text-base-content/50">
              Width
              <input
                type="number"
                min={1}
                max={8192}
                className="input input-sm input-bordered rounded-none font-mono"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <span className="mt-4 text-base-content/40">×</span>
            <label className="flex-1 flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wide text-base-content/50">
              Height
              <input
                type="number"
                min={1}
                max={8192}
                className="input input-sm input-bordered rounded-none font-mono"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="px-2.5 py-1 text-[10px] font-mono border border-base-content/15 text-base-content/60 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wide text-base-content/50">Background</span>
            <div className="flex gap-4">
              {(['white', 'transparent'] as Background[]).map((bg) => (
                <label key={bg} className="flex items-center gap-1.5 text-sm text-base-content/80 cursor-pointer">
                  <input
                    type="radio"
                    name="new-document-background"
                    className="radio radio-xs radio-primary"
                    checked={background === bg}
                    onChange={() => setBackground(bg)}
                  />
                  {bg === 'white' ? 'White' : 'Transparent'}
                </label>
              ))}
            </div>
          </div>
        </div>

        <footer className="panel-footer h-11 p-1.5 gap-1.5">
          <button type="button" className="form-btn flex-1 rounded-none" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            type="button"
            className="form-btn form-btn-primary flex-1 rounded-none"
            onClick={handleCreate}
            disabled={isCreating || width < 1 || height < 1}
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof window !== 'undefined' && window.document?.body) {
    return createPortal(modalContent, window.document.body);
  }
  return null;
};

export default NewDocumentModal;
