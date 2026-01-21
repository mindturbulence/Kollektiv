import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { UploadIcon, ViewColumnsIcon, RefreshIcon, EyeIcon, ViewSplitHorizontalIcon, FolderClosedIcon } from './icons';
import GalleryPickerModal from './GalleryPickerModal';
import type { GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';

// --- TYPES ---
type ViewMode = 'split' | 'sideBySide';

interface ImageState {
  file: File | null;
  url: string;
  width: number;
  height: number;
}

interface TransformState {
  zoom: number;
  pan: { x: number; y: number };
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const ImageSlot: React.FC<{
  onFileSelect: (file: File) => void;
  onLibraryOpen: () => void;
  onRemove: () => void;
  image: ImageState | null;
  title: string;
}> = ({ onFileSelect, onLibraryOpen, onRemove, image, title }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if ((e.currentTarget as any).files?.[0]) {
      onFileSelect((e.currentTarget as any).files![0]);
    }
    if (e.currentTarget) (e.currentTarget as any).value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if ((e.dataTransfer as any).files?.[0]) {
      onFileSelect((e.dataTransfer as any).files[0]);
    }
  };

  if (image) {
    return (
        <div className="p-4 bg-base-100 border border-base-300 group">
            <div className="flex items-center gap-4">
                <img src={image.url} alt={image.file?.name || 'Library File'} className="w-16 h-16 object-cover rounded-none flex-shrink-0 bg-base-300 border border-base-300"/>
                <div className="text-[10px] flex-grow min-w-0">
                    <p className="font-black uppercase tracking-widest text-primary mb-1">{title}</p>
                    <p className="truncate font-bold text-base-content/60" title={image.file?.name || 'Library Image'}>{image.file?.name || 'Library Item'}</p>
                    <p className="text-[9px] font-mono text-base-content/30 mt-1 uppercase">{image.width}×{image.height} {image.file ? `• ${formatBytes(image.file.size)}` : ''}</p>
                </div>
                <button onClick={onRemove} className="btn btn-xs btn-ghost btn-square opacity-20 group-hover:opacity-100 transition-opacity">✕</button>
            </div>
        </div>
    );
  }

  return (
    <div
      className={`p-6 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer gap-4 ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-base-200/10'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-1">{title}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-base-content/20">Source Input</p>
      </div>
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); (inputRef.current as any)?.click(); }} className="btn btn-xs btn-ghost border border-base-300 rounded-none font-black text-[8px] tracking-widest uppercase">UPLOAD</button>
        <button onClick={(e) => { e.stopPropagation(); onLibraryOpen(); }} className="btn btn-xs btn-primary rounded-none font-black text-[8px] tracking-widest uppercase">LIBRARY</button>
      </div>
    </div>
  );
};

interface ViewProps {
    imageA: ImageState;
    imageB: ImageState;
    transform: TransformState;
}

const useBaseImageStyle = (transform: TransformState) => {
    return useMemo(() => ({
        position: 'absolute' as const,
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const,
        transform: `translate(${transform.pan.x}px, ${transform.pan.y}px) scale(${transform.zoom})`,
        transformOrigin: 'center',
        userSelect: 'none' as const,
        maxWidth: 'none',
        maxHeight: 'none',
        transition: 'transform 0.1s ease-out',
    }), [transform]);
};


const SplitView: React.FC<ViewProps & {
    viewerRef: React.RefObject<HTMLDivElement>;
}> = ({ imageA, imageB, transform }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDraggingSlider, setIsDraggingSlider] = useState(false);
    const viewerRef = useRef<HTMLDivElement>(null);

    const handleSliderMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingSlider(true);
    };

    const handleSliderMove = useCallback((e: any) => {
        if (!isDraggingSlider || !viewerRef.current) return;
        const rect = (viewerRef.current as any).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPosition(percentage);
    }, [isDraggingSlider]);

    const handleSliderMouseUp = useCallback(() => setIsDraggingSlider(false), []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).addEventListener('mousemove', handleSliderMove);
            (window as any).addEventListener('mouseup', handleSliderMouseUp);
            return () => {
                (window as any).removeEventListener('mousemove', handleSliderMove);
                (window as any).removeEventListener('mouseup', handleSliderMouseUp);
            };
        }
    }, [handleSliderMove, handleSliderMouseUp]);

    const baseImageStyle = useBaseImageStyle(transform);
    
    return (
        <div ref={viewerRef} className="w-full h-full relative overflow-hidden">
            <img src={imageA.url} style={baseImageStyle} draggable={false} />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}>
                <img src={imageB.url} style={baseImageStyle} draggable={false} />
            </div>
            <div className="absolute top-0 bottom-0 h-full w-[2px] bg-primary cursor-ew-resize z-10" style={{ left: `${sliderPosition}%` }} onMouseDown={handleSliderMouseDown}>
                <div className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-8 rounded-none bg-primary flex items-center justify-center text-primary-content shadow-2xl">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                </div>
            </div>
        </div>
    );
};

const SideBySideView: React.FC<ViewProps> = ({ imageA, imageB, transform }) => {
    const baseImageStyle = useBaseImageStyle(transform);
    
    return (
        <div className="flex w-full h-full">
            <div className="w-1/2 h-full relative overflow-hidden">
                <img src={imageA.url} style={baseImageStyle} draggable={false} />
            </div>
            <div className="w-1/2 h-full relative overflow-hidden border-l border-base-300">
                <img src={imageB.url} style={baseImageStyle} draggable={false} />
            </div>
        </div>
    );
};

const ImageCompare: React.FC = () => {
    const [imageA, setImageA] = useState<ImageState | null>(null);
    const [imageB, setImageB] = useState<ImageState | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [transform, setTransform] = useState<TransformState>({ zoom: 1, pan: { x: 0, y: 0 } });
    
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: transform.pan.x, panY: transform.pan.y });
    const viewerRef = useRef<HTMLDivElement>(null);

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTargetIndex, setPickerTargetIndex] = useState<'A' | 'B' | null>(null);

    useEffect(() => {
        const url = imageA?.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [imageA]);

    useEffect(() => {
        const url = imageB?.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [imageB]);
    
    const handleFileSelect = (file: File, imageSlot: 'A' | 'B') => {
        const url = URL.createObjectURL(file);
        const img = new (window as any).Image();
        img.onload = () => {
            const imageData = { file, url, width: img.naturalWidth, height: img.naturalHeight };
            if (imageSlot === 'A') setImageA(imageData);
            else setImageB(imageData);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
        };
        img.src = url;
    };

    const handleLibrarySelect = async (items: GalleryItem[]) => {
        if (!items.length || !pickerTargetIndex) return;
        const gItem = items[0];
        const blob = await fileSystemManager.getFileAsBlob(gItem.urls[0]);
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const img = new (window as any).Image();
        img.onload = () => {
            const imageData = { file: null, url, width: img.naturalWidth, height: img.naturalHeight };
            if (pickerTargetIndex === 'A') setImageA(imageData);
            else setImageB(imageData);
        };
        img.src = url;
    };

    const handleResetView = useCallback(() => {
        setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
    }, []);

    useEffect(() => {
        handleResetView();
    }, [viewMode, handleResetView]);
    
    const handleResetAll = () => {
        setImageA(null);
        setImageB(null);
        handleResetView();
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!viewerRef.current) return;
        e.preventDefault();
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? transform.zoom * zoomFactor : transform.zoom / zoomFactor;
        const clampedZoom = Math.max(1, Math.min(newZoom, 20));
        if (clampedZoom <= 1) { handleResetView(); return; }
        setTransform(prev => ({ ...prev, zoom: clampedZoom }));
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || transform.zoom <= 1) return;
        e.preventDefault(); e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: transform.pan.x, panY: transform.pan.y };
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setTransform(prev => ({ ...prev, pan: { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy }}));
    };

    const handleMouseUpOrLeave = () => setIsPanning(false);
    
    return (
        <div className="h-full bg-base-100 flex flex-col overflow-hidden">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 flex flex-col border-r border-base-300 overflow-hidden">
                    <header className="p-6 border-b border-base-300 bg-base-200/10">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Artifact Inputs</h3>
                    </header>
                    <div className="flex-grow p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                           <ImageSlot 
                                onFileSelect={(f) => handleFileSelect(f, 'A')} 
                                onLibraryOpen={() => { setPickerTargetIndex('A'); setIsPickerOpen(true); }}
                                onRemove={() => setImageA(null)} 
                                image={imageA} 
                                title="Primary Image" 
                           />
                           <ImageSlot 
                                onFileSelect={(f) => handleFileSelect(f, 'B')} 
                                onLibraryOpen={() => { setPickerTargetIndex('B'); setIsPickerOpen(true); }}
                                onRemove={() => setImageB(null)} 
                                image={imageB} 
                                title="Secondary Image" 
                           />
                        </div>

                        <div className="space-y-4 pt-4 border-t border-base-300/50">
                           <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Visual Matrix</label>
                           <div className="join w-full">
                                <button onClick={() => setViewMode('split')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${viewMode === 'split' ? 'btn-active' : ''}`}><ViewSplitHorizontalIcon className="w-4 h-4 mr-2"/>SPLIT</button>
                                <button onClick={() => setViewMode('sideBySide')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${viewMode === 'sideBySide' ? 'btn-active' : ''}`}><ViewColumnsIcon className="w-4 h-4 mr-2"/>DUAL</button>
                           </div>
                        </div>

                         <div className="pt-4 border-t border-base-300/50">
                            <button onClick={handleResetView} className="btn btn-xs btn-ghost w-full justify-start rounded-none font-black text-[9px] tracking-widest uppercase"><EyeIcon className="w-4 h-4 mr-2 text-primary"/> RE-CENTER OPTICS</button>
                        </div>
                    </div>
                     <footer className="p-4 border-t border-base-300 bg-base-200/20">
                        <button onClick={handleResetAll} className="btn btn-sm btn-ghost w-full rounded-none font-black text-[9px] tracking-widest uppercase text-error/40 hover:text-error hover:bg-error/10">PURGE BUFFERS</button>
                    </footer>
                </aside>

                <main 
                    ref={viewerRef}
                    className="flex-grow bg-base-200/20 overflow-hidden relative"
                    style={{ cursor: transform.zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                >
                    {!imageA || !imageB ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 opacity-10">
                            <RefreshIcon className="w-24 h-24 mb-6" />
                            <p className="text-xl font-black uppercase tracking-widest">Awaiting Dual Input Sequence</p>
                        </div>
                    ) : viewMode === 'split' ? (
                        <SplitView key="split" imageA={imageA} imageB={imageB} transform={transform} viewerRef={viewerRef} />
                    ) : (
                        <SideBySideView key="sideBySide" imageA={imageA} imageB={imageB} transform={transform} />
                    )}
                </main>
            </div>

            <GalleryPickerModal 
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={handleLibrarySelect}
                selectionMode="single"
                typeFilter="image"
                title={`Select image for ${pickerTargetIndex === 'A' ? 'Primary' : 'Secondary'} Image`}
            />
        </div>
    );
};
export default ImageCompare;