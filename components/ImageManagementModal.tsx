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
                    } else {
                        setHasError(true);
                    }
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
        <div className="relative group w-24 h-24 bg-base-200 rounded-lg overflow-hidden flex-shrink-0">
            {hasError || !blobUrl ? (
                 <div className="w-full h-full flex items-center justify-center">
                    <ImageBrokenIcon className="w-8 h-8 text-error"/>
                 </div>
            ) : (
                <img src={blobUrl} className="w-full h-full object-cover" alt="preview"/>
            )}
            <button onClick={onRemove} className="btn btn-sm btn-circle btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100">
                <DeleteIcon className="w-3 h-3"/>
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
    if (isOpen) {
      setImageUrls(item.imageUrls);
    }
  }, [isOpen, item.imageUrls]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.currentTarget as any).files;
    if (!files) return;
    const filesArray = Array.from(files);
    const base64Urls = await Promise.all(filesArray.map(file => fileToBase64(file as Blob)));
    setImageUrls(prev => [...prev, ...base64Urls]);
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(imageUrls);
    onClose();
  };

  if (!isOpen || typeof (window as any).document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-box w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-primary">Manage Images for "{item.name}"</h3>
        <div className="py-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            {imageUrls.map((url, index) => (
              <ImagePreview key={index} url={url} onRemove={() => handleRemoveImage(index)} />
            ))}
            <button onClick={() => (fileInputRef.current as any)?.click()} className="w-24 h-24 border-2 border-dashed border-base-content/30 rounded-lg flex flex-col items-center justify-center text-base-content/50 hover:border-primary hover:text-primary">
              <UploadIcon className="w-8 h-8"/>
              <span className="text-xs mt-1">Add</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" className="hidden" />
          </div>
        </div>
        <div className="modal-action">
          <button onClick={onClose} className="btn btn-sm btn-neutral">Cancel</button>
          <button onClick={handleSave} className="btn btn-sm btn-primary">Save Changes</button>
        </div>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};