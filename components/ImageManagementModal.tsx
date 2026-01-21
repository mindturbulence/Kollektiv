import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CheatsheetItem } from '../types';
import { fileToBase64, fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, DeleteIcon, UploadIcon, ImageBrokenIcon } from './icons';

interface ImagePreviewProps {
  url: string;
  onRemove: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ url, onRemove }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        const loadUrl = async () => {
            if (url.startsWith('data:') || url.startsWith('http')) {
                setBlobUrl(url);
                return;
            }
            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (isActive) {
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        setBlobUrl(objectUrl);
                    } else { setHasError(true); }
                }
            } catch (e) {
                if (isActive) setHasError(true);
            }
        };
        loadUrl();
        return () => {
            isActive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    return (
        <div className="relative group aspect-square bg-base-200 overflow-hidden">
            {hasError || !blobUrl ? (
                 <div className="w-full h-full flex items-center justify-center">
                    <ImageBrokenIcon className="w-8 h-8 text-error"/>
                 </div>
            ) : (
                <img src={blobUrl} className="w-full h-full object-cover" alt="preview"/>
            )}
            <button onClick={onRemove} className="btn btn-sm btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 shadow-lg">
                <DeleteIcon className="w-4 h-4"/>
            </button>
        </div>
    );
};


interface ImageManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CheatsheetItem;
  onSave: (newImageUrls: string[]) => void;
}

export const ImageManagementModal: React.FC<ImageManagementModalProps> = ({ isOpen, onClose, item, onSave }) => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setImageUrls(item.imageUrls);
  }, [isOpen, item.imageUrls]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.currentTarget as any).files;
    if (!files) return;
    const base64Urls = await Promise.all(Array.from(files).map(file => fileToBase64(file as Blob)));
    setImageUrls(prev => [...prev, ...base64Urls]);
  };

  const handleSave = () => {
    onSave(imageUrls);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-4xl mx-auto flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-10 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-6xl font-black tracking-tighter text-base-content leading-none">
                SAMPLES<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Managing Artifacts for: {item.name}</p>
        </header>

        <div className="p-10 flex-grow overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-base-300 border border-base-300 mb-8">
            {imageUrls.map((url, index) => (
              <div key={index} className="bg-base-100">
                  <ImagePreview url={url} onRemove={() => setImageUrls(prev => prev.filter((_, i) => i !== index))} />
              </div>
            ))}
            <button 
                onClick={() => (fileInputRef.current as any)?.click()} 
                className="aspect-square bg-base-200/30 flex flex-col items-center justify-center text-base-content/40 hover:text-primary hover:bg-base-200 transition-all group"
            >
              <UploadIcon className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform"/>
              <span className="text-[10px] font-black uppercase tracking-widest">Add Sample</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" className="hidden" />
          </div>
        </div>

        <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/10">
          <button onClick={onClose} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Abort</button>
          <button onClick={handleSave} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8 shadow-lg">Commit Artifacts</button>
        </footer>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};