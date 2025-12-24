
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { UploadIcon, ViewColumnsIcon, RefreshIcon, EyeIcon, ViewSplitHorizontalIcon } from './icons';

// --- TYPES ---
type ViewMode = 'split' | 'sideBySide';

interface ImageState {
  file: File;
  url: string;
  width: number;
  height: number;
}

interface TransformState {
  zoom: number;
  pan: { x: number; y: number };
}

// --- HELPER FUNCTIONS ---
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- SUB-COMPONENTS ---

const ImageSlot: React.FC<{
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  image: ImageState | null;
  title: string;
}> = ({ onFileSelect, onRemove, image, title }) => {
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
        <div className="p-3 bg-base-200 rounded-lg">
            <div className="flex items-center gap-3">
                <img src={image.url} alt={image.file.name} className="w-16 h-16 object-cover rounded-md flex-shrink-0 bg-base-300"/>
                <div className="text-xs flex-grow min-w-0">
                    <p className="font-semibold text-base-content">{title}</p>
                    <p className="truncate text-base-content/70" title={image.file.name}>{image.file.name}</p>
                    <p className="text-base-content/70">{image.width}x{image.height} · {formatBytes(image.file.size)}</p>
                </div>
                <button onClick={onRemove} className="btn btn-xs btn-ghost btn-circle text-error flex-shrink-0">✕</button>
            </div>
        </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-lg border-2 border-dashed transition-colors h-24 flex items-center justify-center text-center cursor-pointer ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => (inputRef.current as any)?.click()}
    >
      <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-base-content/60">Drop image or click</p>
      </div>
    </div>
  );
};

interface ViewProps {
    imageA: ImageState;
    imageB: ImageState;
    transform: TransformState;
}

// Refactored style hook for consistency and to apply new zoom behavior
const useBaseImageStyle = (transform: TransformState) => {
    return useMemo(() => ({
        position: 'absolute' as const,
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const,
        transform: `translate(${transform.pan.x}px, ${transform.pan.y}px) scale(${transform.zoom})`,
        transformOrigin: 'center', // Zooms from the center
        userSelect: 'none' as const,
        maxWidth: 'none',
        maxHeight: 'none',
        transition: 'transform 0.1s ease-out', // Smoother zoom
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
            <div className="absolute top-0 bottom-0 h-full w-1 bg-primary cursor-ew-resize z-10" style={{ left: `${sliderPosition}%` }} onMouseDown={handleSliderMouseDown}>
                <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content">
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
            <div className="w-1/2 h-full relative overflow-hidden border-l-2 border-primary">
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
    const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
    const viewerRef = useRef<HTMLDivElement>(null);

    // Correctly manage blob URL lifecycles with separate effects.
    // This prevents one image's URL from being revoked when the other one changes.
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
            if (imageSlot === 'A') {
                setImageA(imageData);
            } else {
                setImageB(imageData);
            }
        };
        img.onerror = () => {
            console.error("Failed to load image for comparison.");
            URL.revokeObjectURL(url); // Clean up if the image is invalid
        };
        img.src = url;
    };

    const handleResetView = useCallback(() => {
        setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
    }, []);

    // Reset view when switching between split and side-by-side
    useEffect(() => {
        handleResetView();
    }, [viewMode, handleResetView]);
    
    const handleResetAll = () => {
        // Setting state to null will trigger the useEffect cleanup to revoke URLs
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

        if (clampedZoom <= 1) {
            handleResetView();
            return;
        }
        
        // Simply update the zoom, pan is preserved.
        // The browser handles zooming from the center due to transform-origin.
        setTransform(prev => ({
            ...prev,
            zoom: clampedZoom,
        }));
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || transform.zoom <= 1) return;
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: transform.pan.x, panY: transform.pan.y };
        if(viewerRef.current) (viewerRef.current as any).style.cursor = 'grabbing';
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setTransform(prev => ({ ...prev, pan: { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy }}));
    };

    const handleMouseUpOrLeave = () => {
        if (isPanning) {
            setIsPanning(false);
            if(viewerRef.current) (viewerRef.current as any).style.cursor = 'grab';
        }
    };
    
    return (
        <div className="p-6 bg-base-200 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                <aside className="lg:col-span-1 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0 text-sm">
                    <div className="p-4 border-b border-base-300"><h2 className="text-lg font-bold">Controls</h2></div>
                    <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                        <div className="space-y-2">
                           <ImageSlot onFileSelect={(f) => handleFileSelect(f, 'A')} onRemove={() => setImageA(null)} image={imageA} title="Image A" />
                           <ImageSlot onFileSelect={(f) => handleFileSelect(f, 'B')} onRemove={() => setImageB(null)} image={imageB} title="Image B" />
                        </div>
                        <div className="divider"></div>
                        <div>
                           <label className="label-text pb-1 font-semibold">View Mode</label>
                           <div className="join w-full mt-1">
                                <button onClick={() => setViewMode('split')} className={`btn btn-sm join-item flex-1 ${viewMode === 'split' ? 'btn-active' : ''}`}><ViewSplitHorizontalIcon className="w-5 h-5"/></button>
                                <button onClick={() => setViewMode('sideBySide')} className={`btn btn-sm join-item flex-1 ${viewMode === 'sideBySide' ? 'btn-active' : ''}`}><ViewColumnsIcon className="w-5 h-5"/></button>
                           </div>
                        </div>
                         <div>
                            <label className="label-text pb-1 font-semibold">Interaction</label>
                            <div className="space-y-2 mt-1">
                                <button onClick={handleResetView} className="btn btn-sm btn-ghost w-full justify-start"><EyeIcon className="w-4 h-4 mr-2"/> Reset View</button>
                            </div>
                        </div>
                    </div>
                     <div className="p-4 border-t border-base-300">
                        <button onClick={handleResetAll} className="btn btn-sm btn-error btn-outline w-full"><RefreshIcon className="w-4 h-4 mr-2"/>Reset All</button>
                    </div>
                </aside>
                <main 
                    ref={viewerRef}
                    className="lg:col-span-3 bg-base-100/50 bg-[linear-gradient(45deg,_oklch(var(--b2))_25%,_transparent_25%),_linear-gradient(-45deg,_oklch(var(--b2))_25%,_transparent_25%),_linear-gradient(45deg,_transparent_75%,_oklch(var(--b2))_75%),_linear-gradient(-45deg,_transparent_75%,_oklch(var(--b2))_75%)] bg-[length:20px_20px] rounded-xl shadow-xl overflow-hidden relative"
                    style={{ cursor: transform.zoom > 1 ? 'grab' : 'default' }}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                >
                    {!imageA || !imageB ? (
                        <div className="w-full h-full flex items-center justify-center text-base-content/60 p-4 text-center">
                            <p>Upload two images using the slots on the left to begin comparison</p>
                        </div>
                    ) : viewMode === 'split' ? (
                        <SplitView key="split" imageA={imageA} imageB={imageB} transform={transform} viewerRef={viewerRef} />
                    ) : (
                        <SideBySideView key="sideBySide" imageA={imageA} imageB={imageB} transform={transform} />
                    )}
                </main>
            </div>
        </div>
    );
};
export default ImageCompare;