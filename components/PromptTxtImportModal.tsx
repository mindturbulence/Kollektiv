import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PromptCategory } from '../types';
import { UploadIcon } from './icons';

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

  const resetState = () => {
    setSelectedFile(null);
    setCategoryId('');
    setError(null);
    setIsDragging(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedFile) {
        setError("Please select a zip file to import.");
        return;
    }
    onImport(selectedFile, categoryId);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.currentTarget as any).files?.[0];
    if (file && file.type === 'application/zip') {
        setSelectedFile(file);
        setError(null);
    } else {
        setError("Please select a valid .zip file.");
        setSelectedFile(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = (e.dataTransfer as any)?.files?.[0];
    if (file && file.type === 'application/zip') {
        setSelectedFile(file);
        setError(null);
    } else {
        setError("Please drop a valid .zip file.");
        setSelectedFile(null);
    }
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={handleClose}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-primary">Import Prompts from .txt Files</h3>
            <div className="py-4 space-y-4">
                 <div 
                    onDrop={handleDrop} 
                    onDragOver={handleDragOver} 
                    onDragLeave={handleDragLeave}
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/50'}`}
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".zip,application/zip"/>
                    <UploadIcon className="w-10 h-10 mx-auto text-base-content/40 mb-2"/>
                    <p className="text-base-content/70">Drop a .zip file here</p>
                    {selectedFile && <p className="text-sm font-semibold text-success mt-2">Selected: {selectedFile.name}</p>}
                </div>
                 <div>
                    <label className="block text-sm font-medium text-base-content/80 mb-1">Assign to Category (Optional):</label>
                    <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">
                        <option value="">Uncategorized</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                </div>
                {error && <p className="text-error text-sm">{error}</p>}
            </div>
            <div className="modal-action">
                <button onClick={handleClose} className="btn btn-neutral btn-sm">Cancel</button>
                <button onClick={handleSubmit} disabled={!selectedFile} className="btn btn-primary btn-sm">Import</button>
            </div>
        </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};