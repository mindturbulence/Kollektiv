import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PromptCategory } from '../types';
import { UploadIcon, CloseIcon } from './icons';
import { audioService } from '../services/audioService';

interface PromptTxtImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, categoryId: string) => void;
  categories: PromptCategory[];
}

export const PromptTxtImportModal: React.FC<PromptTxtImportModalProps> = ({ isOpen, onClose, onImport, categories }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    audioService.playClick();
    setSelectedFile(null);
    setCategoryId('');
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    audioService.playClick();
    if (!selectedFile) return;
    onImport(selectedFile, categoryId);
  };
  
  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={handleClose}>
        <div className="flex flex-col bg-transparent w-full max-w-2xl mx-auto relative p-[3px] corner-frame overflow-visible" onClick={(e) => e.stopPropagation()}>
            <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
                <header className="px-8 py-4 border-b border-base-300 bg-transparent relative flex items-center justify-between">
                    <div className="flex flex-col">
                        <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                            IMPORT<span className="text-primary">.</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Bulk Token Archival Module</p>
                    </div>
                    <button onClick={handleClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </header>

                <div className="p-10 space-y-8">
                    <div 
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = (e.dataTransfer as any)?.files?.[0]; if (file?.type === 'application/zip') { setSelectedFile(file); setError(null); } else setError("Valid .zip required."); }} 
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} 
                        onDragLeave={() => setIsDragging(false)}
                        onClick={() => { audioService.playClick(); (fileInputRef.current as any)?.click(); }}
                        className={`p-16 border-4 border-dashed rounded-none text-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-transparent'}`}
                    >
                        <input type="file" ref={fileInputRef} onChange={(e) => { const file = (e.currentTarget as any).files?.[0]; if (file?.type === 'application/zip') { setSelectedFile(file); setError(null); } else setError("Valid .zip required."); }} className="hidden" accept=".zip"/>
                        <UploadIcon className="w-12 h-12 mx-auto text-base-content/20 mb-4"/>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-base-content/40">Drop .zip archive of .txt tokens</p>
                        {selectedFile && <p className="text-lg font-bold text-success mt-4 tracking-tight">{selectedFile.name}</p>}
                    </div>

                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Category Destination</label>
                        <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="form-select w-full">
                            <option value="">Global Repository</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>
                    {error && <p className="text-error font-bold text-xs uppercase tracking-widest">{error}</p>}
                </div>

                <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
                    <button onClick={handleClose} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                        <span/><span/><span/><span/>
                        ABORT
                    </button>
                    <button onClick={handleSubmit} disabled={!selectedFile} className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display">
                        <span/><span/><span/><span/>
                        INGEST ZIP
                    </button>
                </footer>
            </div>
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
        </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};