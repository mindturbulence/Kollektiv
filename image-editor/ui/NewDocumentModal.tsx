// ─── Kollektiv Image Editor — New Document Modal ───────────────────────────
// Entry point when the editor opens without a payload: open an existing image
// (picker or drop) or create a blank canvas. Shell is the shared Modal.
//
// Layout contract: every section sits in the same 16px gutter (p-4, matching the Modal header), controls
// use the app's standard 40px size (form-input / form-btn, no h-/px- overrides —
// those classes are unlayered and beat utilities), and choices are segmented
// buttons so nothing depends on native radio metrics.

import React, { useState } from 'react';
import Modal from '../../components/Modal';
import { UploadIcon } from '../../components/icons';
import { MAX_DIM } from '../core/io/FileIO';

type Background = 'white' | 'transparent';

const PRESETS = [
  { label: '1024 × 1024', width: 1024, height: 1024 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '512 × 512', width: 512, height: 512 },
] as const;

const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'transparent', label: 'Transparent' },
];

const FIELD_LABEL = 'text-2xs font-mono uppercase tracking-widest text-base-content/60';
const segment = (active: boolean) =>
  `h-9 px-2 py-0 border text-2xs font-mono tracking-wider whitespace-nowrap transition-colors ${
    active ? 'border-primary text-primary bg-primary/10' : 'border-base-content/15 text-base-content/70 hover:border-base-content/40 hover:text-base-content'
  }`;

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number, background: Background) => void | Promise<void>;
  onOpenImage: () => void;
  onDropFile: (file: File) => void;
}

const NewDocumentModal: React.FC<NewDocumentModalProps> = ({ isOpen, onClose, onCreate, onOpenImage, onDropFile }) => {
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [background, setBackground] = useState<Background>('white');
  const [isCreating, setIsCreating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // H13: the HTML max attribute is advisory only — enforce in code.
  const isValidSize = width >= 1 && height >= 1 && width <= MAX_DIM && height <= MAX_DIM;

  const handleCreate = async () => {
    if (!isValidSize || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(Math.round(width), Math.round(height), background);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Open or Create">
      <div className="p-4 flex flex-col gap-5">
        <button
          type="button"
          className={`w-full h-32 flex flex-col items-center justify-center gap-1.5 py-0 border border-dashed transition-colors ${
            isDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-base-content/20 text-base-content/70 hover:border-primary/50 hover:text-primary'
          }`}
          onClick={onOpenImage}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragOver(true); } }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onDropFile(file);
          }}
        >
          <UploadIcon className="w-6 h-6" />
          <span className="text-xs font-bold tracking-widest">Open image…</span>
          <span className="text-2xs font-mono tracking-widest text-base-content/60">or drop a file here · Ctrl+O</span>
        </button>

        <div className={`flex items-center gap-3 ${FIELD_LABEL}`}>
          <span className="flex-1 border-t border-base-content/10" />
          or start blank
          <span className="flex-1 border-t border-base-content/10" />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1.5 items-center">
          <label htmlFor="new-doc-width" className={FIELD_LABEL}>Width</label>
          <span />
          <label htmlFor="new-doc-height" className={FIELD_LABEL}>Height</label>
          <input
            id="new-doc-width"
            type="number"
            min={1}
            max={MAX_DIM}
            className="form-input w-full font-mono"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <span className="text-base-content/60 text-center" aria-hidden="true">×</span>
          <input
            id="new-doc-height"
            type="number"
            min={1}
            max={MAX_DIM}
            className="form-input w-full font-mono"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={segment(width === preset.width && height === preset.height)}
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
          <span className={FIELD_LABEL} id="new-doc-background-label">Background</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="new-doc-background-label">
            {BACKGROUNDS.map((bg) => (
              <button
                key={bg.value}
                type="button"
                role="radio"
                aria-checked={background === bg.value}
                className={segment(background === bg.value)}
                onClick={() => setBackground(bg.value)}
              >
                {bg.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 px-4 py-4 border-t border-base-content/10">
        <button type="button" className="form-btn flex-1" onClick={onClose} disabled={isCreating}>
          Cancel
        </button>
        <button type="button" className="form-btn form-btn-primary flex-1" onClick={handleCreate} disabled={isCreating || !isValidSize}>
          {isCreating ? 'Creating…' : 'Create Blank'}
        </button>
      </div>
    </Modal>
  );
};

export default NewDocumentModal;
