import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PromptCategory } from '../types';
import { UploadIcon, CloseIcon } from './icons';

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
    setSelectedFile(null);
    setCategoryId('');
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedFile) return;
    onImport(selectedFile, categoryId);
  };
  
  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={handleClose}>
        <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-2xl mx-auto flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <header className="p-10 border-b border-base-300 bg-base-200/20 relative">
                <button onClick={handleClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                    <CloseIcon className="w-6 h-6" />
                </button>
                <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                    IMPORT<span className="text-primary">.</span>
                </h3>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Bulk Token Archival Module</p>
            </header>

            <div className="p-10 space-y-8">
                 <div 
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = (e.dataTransfer as any)?.files?.[0]; if (file?.type === 'application/zip') { setSelectedFile(file); setError(null); } else setError("Valid .zip required."); }} 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} 
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className={`p-16 border-4 border-dashed rounded-none text-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-base-200/20'}`}
                >
                    <input type="file" ref={fileInputRef} onChange={(e) => { const file = (e.currentTarget as any).files?.[0]; if (file?.type === 'application/zip') { setSelectedFile(file); setError(null); } else setError("Valid .zip required."); }} className="hidden" accept=".zip"/>
                    <UploadIcon className="w-12 h-12 mx-auto text-base-content/20 mb-4"/>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-base-content/40">Drop .zip archive of .txt tokens</p>
                    {selectedFile && <p className="text-lg font-bold text-success mt-4 tracking-tight">{selectedFile.name}</p>}
                </div>

                 <div className="form-control">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Category Destination</label>
                    <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="select select-bordered rounded-none font-bold tracking-tight w-full">
                        <option value="">Global Repository</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                </div>
                {error && <p className="text-error font-bold text-xs uppercase tracking-widest">{error}</p>}
            </div>

            <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                <button onClick={handleClose} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Abort</button>
                <button onClick={handleSubmit} disabled={!selectedFile} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">Execute Ingestion</button>
            </footer>
        </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};