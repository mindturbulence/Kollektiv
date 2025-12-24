
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { UploadIcon, CloseIcon, LinkIcon, LinkOffIcon, ViewGridIcon, RefreshIcon, DownloadIcon } from './icons';
import useLocalStorage from '../utils/useLocalStorage';
import { COMPOSER_PRESETS, Preset } from '../constants';

// --- TYPES AND INTERFACES ---
type ImageItem = {
  file: File;
  id: string;
  originalUrl: string;
  width: number;
  height: number;
  scale: number;
  posX: number;
  posY: number;
}

// --- HELPER FUNCTIONS ---
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);


// --- SUB-COMPONENTS ---

const GridCell: React.FC<{
    item: ImageItem;
    imageFit: 'cover' | 'contain';
    onRemove: () => void;
    onTransform: (transform: { scale?: number; posX?: number; posY?: number }) => void;
}> = ({ item, imageFit, onRemove, onTransform }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleWheel = (e: React.WheelEvent) => {
        if (imageFit !== 'contain') return; // Prevent zoom in 'cover' mode
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.max(0.5, Math.min(item.scale + delta, 5));
        
        if (newScale <= 1) { // If scale is at or below 1, reset position
            onTransform({ scale: newScale, posX: 0, posY: 0 });
        } else {
            onTransform({ scale: newScale });
        }
    };
    
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || imageFit !== 'contain') return; // Prevent pan in 'cover' mode
        e.preventDefault();
        isPanning.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as any).style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanning.current || imageFit !== 'contain') return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        
        onTransform({ posX: item.posX + dx, posY: item.posY + dy });
    };
    
    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isPanning.current) {
            isPanning.current = false;
            if (imageFit === 'contain') {
                (e.currentTarget as any).style.cursor = 'grab';
            }
        }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isPanning.current) {
            isPanning.current = false;
            if (imageFit === 'contain') {
               (e.currentTarget as any).style.cursor = 'grab';
            }
        }
        setIsHovered(false);
    };

    const handleReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        onTransform({ scale: 1, posX: 0, posY: 0 });
    };

    return (
        <div 
            ref={containerRef}
            className={`w-full h-full relative overflow-hidden group ${imageFit === 'contain' ? 'cursor-grab' : 'cursor-default'}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
        >
            <img 
                src={item.originalUrl}
                className="absolute top-0 left-0 transition-transform duration-75 ease-out pointer-events-none"
                style={{ 
                    objectFit: imageFit,
                    width: '100%',
                    height: '100%',
                    transform: `translate(${item.posX}px, ${item.posY}px) scale(${item.scale})`
                }}
                alt={item.file.name} 
                draggable="false"
            />
            {isHovered && imageFit === 'contain' && (
                <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
            )}
             <button onClick={onRemove} className="btn btn-xs btn-circle btn-error absolute -top-1 -right-1 z-10 opacity-0 group-hover:opacity-100">
                <CloseIcon className="w-3 h-3"/>
            </button>
            {isHovered && imageFit === 'contain' && (
                <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-2 bg-black/50 p-1 rounded-full backdrop-blur-sm pointer-events-auto">
                    <input 
                        type="range"
                        min="0.5"
                        max="5"
                        step="0.05"
                        value={item.scale}
                        onChange={(e) => onTransform({ scale: parseFloat((e.currentTarget as any).value) })}
                        className="range range-xs range-primary flex-grow"
                    />
                    <button onClick={handleReset} className="btn btn-xs btn-ghost btn-circle" title="Reset Position & Scale">
                        <RefreshIcon className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};


const ComposerPage: React.FC = () => {
    // --- STATE MANAGEMENT ---
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const dragItemIndex = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Settings State
    const [columns, setColumns] = useLocalStorage('composerCols', 3);
    const [rows, setRows] = useLocalStorage('composerRows', 3);
    const [spacing, setSpacing] = useLocalStorage('composerSpacing', 8);
    
    // Refactored imageFit to force a state transition on load, triggering the useLayoutEffect.
    const [storedImageFit, setStoredImageFit] = useLocalStorage<'cover' | 'contain'>('composerFit', 'contain');
    const [imageFit, setImageFit] = useState<'cover' | 'contain'>('contain');

    const [outputFormat, setOutputFormat] = useLocalStorage<'png' | 'jpeg'>('composerFormat', 'jpeg');
    const [bgColor, setBgColor] = useLocalStorage('composerBgColor', '#FFFFFF');
    
    // Aspect Ratio State
    const [width, setWidth] = useLocalStorage('composerWidth', '1024');
    const [height, setHeight] = useLocalStorage('composerHeight', '1024');
    const [isLocked, setIsLocked] = useLocalStorage('composerLock', true);
    const [ratio, setRatio] = useState(1);
    
    const [gridItems, setGridItems] = useState<(ImageItem | null)[]>([]);

    // State for flicker-free rendering
    const [gridPixelDimensions, setGridPixelDimensions] = useState({ width: 0, height: 0 });
    
    // --- EFFECTS ---
    
    // Sync internal imageFit state with localStorage value on mount.
    useEffect(() => {
        setImageFit(storedImageFit);
    }, [storedImageFit]);

    // Initialize or resize the grid array when columns/rows change
    useEffect(() => {
        setGridItems(currentItems => {
            const newSize = columns * rows;
            const newItems = Array(newSize).fill(null);
            const existingImages = currentItems.filter((item): item is ImageItem => item !== null);
            for (let i = 0; i < Math.min(existingImages.length, newSize); i++) {
                newItems[i] = existingImages[i];
            }
            return newItems;
        });
    }, [columns, rows]);

    // When the global image fit mode changes, reset all image transforms
    useLayoutEffect(() => {
        setGridItems(currentItems => 
            currentItems.map(item => 
                item ? { ...item, scale: 1, posX: 0, posY: 0 } : null
            )
        );
    }, [imageFit]);
    
    // Update ratio whenever width or height changes
    useEffect(() => {
        const numW = parseInt(width, 10);
        const numH = parseInt(height, 10);
        if (numW > 0 && numH > 0) {
            setRatio(numW / numH);
        }
    }, [width, height]);

    // Flicker-free resizing logic for preview
    useLayoutEffect(() => {
        const container = previewContainerRef.current;
        if (!container || typeof window === 'undefined' || !('ResizeObserver' in (window as any))) return;

        const updateDimensions = () => {
            const numW = parseInt(width, 10);
            const numH = parseInt(height, 10);
            if (isNaN(numW) || isNaN(numH) || numW <= 0 || numH <= 0) {
                setGridPixelDimensions({ width: 0, height: 0 });
                return;
            };
            
            const aspectRatio = numW / numH;
            const { clientWidth: containerWidth, clientHeight: containerHeight } = container as any;

            let gridW, gridH;
            const widthAtMaxHeight = containerHeight * aspectRatio;

            if (widthAtMaxHeight <= containerWidth) {
                gridH = containerHeight;
                gridW = widthAtMaxHeight;
            } else {
                gridW = containerWidth;
                gridH = containerWidth / aspectRatio;
            }
            
            setGridPixelDimensions({ width: gridW, height: gridH });
        };
        
        const observer = new (window as any).ResizeObserver(updateDimensions);
        observer.observe(container);
        updateDimensions();

        return () => observer.disconnect();

    }, [width, height]);

    // Cleanup object URLs
    useEffect(() => () => {
        gridItems.forEach(item => {
            if (item) URL.revokeObjectURL(item.originalUrl);
        });
    }, []);

    // --- DERIVED STATE & MEMOS ---
    const ratioText = useMemo(() => {
        const w = parseInt(width, 10);
        const h = parseInt(height, 10);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return 'N/A';
        const divisor = gcd(w, h);
        return `${w / divisor}:${h / divisor}`;
    }, [width, height]);

    // --- CALLBACKS & HANDLERS ---
    const handleWidthChange = (value: string) => {
        setWidth(value);
        if (isLocked) {
            const numW = parseInt(value, 10);
            if (numW > 0) {
                const numH = parseInt(height, 10);
                const currentRatio = (numH > 0 && numW > 0) ? numW / numH : ratio;
                setHeight(String(Math.round(numW / currentRatio)));
            } else if (value === '') {
                setHeight('');
            }
        }
    };

    const handleHeightChange = (value: string) => {
        setHeight(value);
        if (isLocked) {
            const numH = parseInt(value, 10);
            if (numH > 0) {
                const numW = parseInt(width, 10);
                const currentRatio = (numW > 0 && numH > 0) ? numW / numH : ratio;
                setWidth(String(Math.round(numH * currentRatio)));
            } else if (value === '') {
                setWidth('');
            }
        }
    };
    
    const applyPreset = (preset: Pick<Preset, 'width' | 'height'>) => {
        setWidth(String(preset.width));
        setHeight(String(preset.height));
    };
    
    const handleAddFiles = useCallback(async (files: File[], dropIndex?: number) => {
        if (typeof window === 'undefined') return;
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const newImageItems: (ImageItem | null)[] = await Promise.all(
            imageFiles.map(file => new Promise<ImageItem | null>(resolve => {
                const originalUrl = URL.createObjectURL(file);
                const img = new (window as any).Image();
                img.onload = () => resolve({
                    file,
                    id: `${file.name}-${file.lastModified}-${Math.random()}`,
                    originalUrl,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    scale: 1, posX: 0, posY: 0
                });
                img.onerror = () => {
                    URL.revokeObjectURL(originalUrl);
                    resolve(null);
                };
                img.src = originalUrl;
            }))
        );
        const validImages = newImageItems.filter((item): item is ImageItem => item !== null);

        setGridItems(currentItems => {
            const updatedItems = [...currentItems];
            let validImageIdx = 0;

            if (dropIndex !== undefined) {
                for (let i = dropIndex; i < updatedItems.length && validImageIdx < validImages.length; i++) {
                    if (updatedItems[i] === null) {
                        updatedItems[i] = validImages[validImageIdx++];
                    }
                }
            }
            for (let i = 0; i < updatedItems.length && validImageIdx < validImages.length; i++) {
                 if (updatedItems[i] === null) {
                    updatedItems[i] = validImages[validImageIdx++];
                }
            }
            return updatedItems;
        });
    }, []);

    const handleRemoveImage = (index: number) => {
        setGridItems(prev => {
            const newItems = [...prev];
            const itemToRemove = newItems[index];
            if (itemToRemove) {
                URL.revokeObjectURL(itemToRemove.originalUrl);
            }
            newItems[index] = null;
            return newItems;
        });
    };

    const handleItemTransform = (index: number, transform: { scale?: number; posX?: number; posY?: number }) => {
        setGridItems(prev => {
            const newItems = [...prev];
            const item = newItems[index];
            if (item) {
                newItems[index] = { ...item, ...transform };
            }
            return newItems;
        });
    };
    
    const handleClearAll = () => {
        gridItems.forEach(img => {
            if (img) URL.revokeObjectURL(img.originalUrl);
        });
        setGridItems(Array(columns * rows).fill(null));
    };

    const handleDownload = useCallback(async () => {
        if (gridItems.filter(Boolean).length === 0 || typeof window === 'undefined' || typeof (window as any).document === 'undefined') return;
        setIsDownloading(true);

        const canvas = (window as any).document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const numW = parseInt(width, 10);
        const numH = parseInt(height, 10);
        const container = previewContainerRef.current;

        if (!ctx || isNaN(numW) || isNaN(numH) || numW <= 0 || numH <= 0 || !container) {
            console.error("Invalid canvas dimensions or context.");
            setIsDownloading(false);
            return;
        }

        canvas.width = numW;
        canvas.height = numH;
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const numCols = columns;
        const spacingPx = spacing;

        const cellWidth = (canvas.width - (spacingPx * (numCols - 1))) / numCols;
        const cellHeight = (canvas.height - (spacingPx * (rows - 1))) / rows;
        
        const previewCellWidth = (gridPixelDimensions.width - (spacingPx * (numCols - 1))) / numCols;
        const panScaleFactor = previewCellWidth > 0 ? cellWidth / previewCellWidth : 1;

        const imagePromises = gridItems.map((item, i) => {
            if (!item) return Promise.resolve();
            return new Promise<void>(async (resolve) => {
                const img = new (window as any).Image();
                img.src = item.originalUrl;
                img.crossOrigin = "anonymous";
                await new Promise(res => { img.onload = res; img.onerror = () => { console.error("failed to load image for canvas"); res(null); }; });
                
                if (!img.naturalWidth) { resolve(); return; }

                const row = Math.floor(i / numCols);
                const col = i % numCols;
                const cellX = col * (cellWidth + spacingPx);
                const cellY = row * (cellHeight + spacingPx);

                ctx.save();
                ctx.beginPath();
                ctx.rect(cellX, cellY, cellWidth, cellHeight);
                ctx.clip();
                
                const imgAspect = img.naturalWidth / img.naturalHeight;
                
                if (imageFit === 'cover') {
                    const cellAspect = cellWidth / cellHeight;
                    let sx, sy, sWidth, sHeight;
                    if (imgAspect > cellAspect) { // image wider than cell
                        sHeight = img.naturalHeight;
                        sWidth = sHeight * cellAspect;
                        sx = (img.naturalWidth - sWidth) / 2;
                        sy = 0;
                    } else { // image taller than cell
                        sWidth = img.naturalWidth;
                        sHeight = sWidth / cellAspect;
                        sx = 0;
                        sy = (img.naturalHeight - sHeight) / 2;
                    }
                    ctx.drawImage(img, sx, sy, sWidth, sHeight, cellX, cellY, cellWidth, cellHeight);
                } else { // 'contain'
                    const cellAspect = cellWidth / cellHeight;
                    let dWidth, dHeight, dx, dy;

                    if (imgAspect > cellAspect) { // image wider than cell
                        dHeight = cellWidth / imgAspect;
                        dWidth = cellWidth;
                        dx = cellX;
                        dy = cellY + (cellHeight - dHeight) / 2;
                    } else { // image taller or same aspect
                        dWidth = cellHeight * imgAspect;
                        dHeight = cellHeight;
                        dy = cellY;
                        dx = cellX + (cellWidth - dWidth) / 2;
                    }

                    const panX = item.posX * panScaleFactor;
                    const panY = item.posY * panScaleFactor;
                    const scale = item.scale;

                    const scaledWidth = dWidth * scale;
                    const scaledHeight = dHeight * scale;
                    const finalDx = dx - (scaledWidth - dWidth) / 2 + panX;
                    const finalDy = dy - (scaledHeight - dHeight) / 2 + panY;

                    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, finalDx, finalDy, scaledWidth, scaledHeight);
                }
                
                ctx.restore();
                resolve();
            });
        });

        await Promise.all(imagePromises);

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, `image/${outputFormat}`));

        if (blob && typeof window !== 'undefined' && typeof (window as any).document !== 'undefined') {
            const link = (window as any).document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `kollektiv_grid_${Date.now()}.${outputFormat}`;
            link.click();
            URL.revokeObjectURL(link.href);
        }

        setIsDownloading(false);
    }, [gridItems, width, height, columns, rows, spacing, imageFit, bgColor, outputFormat, gridPixelDimensions]);

    // --- DRAG & DROP ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        if (!gridItems[index]) {
            e.preventDefault();
            return;
        }
        dragItemIndex.current = index;
        if (e.dataTransfer) {
            (e.dataTransfer as any).effectAllowed = 'move';
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (dragItemIndex.current !== null && dragItemIndex.current !== index) {
            setDragOverIndex(index);
        }
    };
    
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setDragOverIndex(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLElement>, dropIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);

        // Handle file drop from outside
        if ((e.dataTransfer as any)?.files?.length > 0) {
            handleAddFiles(Array.from((e.dataTransfer as any).files), dropIndex);
            return;
        }

        // Handle internal re-ordering
        const dragIndex = dragItemIndex.current;
        dragItemIndex.current = null;
        if (dragIndex === null || dragIndex === dropIndex) return;

        setGridItems(prev => {
            const newItems = [...prev];
            const draggedItem = newItems[dragIndex];
            newItems[dragIndex] = newItems[dropIndex];
            newItems[dropIndex] = draggedItem;
            return newItems;
        });
    };
    
    return (
        <div className="p-6 bg-base-200 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                {/* Left Column */}
                <aside className="lg:col-span-1 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0 text-sm">
                    <div className="p-4 border-b border-base-300"><h2 className="text-lg font-bold">Grid Composer</h2></div>
                    <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                        
                        {/* Grid layout */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Grid Layout</label>
                            <div className="flex items-center gap-2">
                                <input type="number" value={columns} onChange={(e) => setColumns(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered w-full" placeholder="Cols"/>
                                <span className="text-xl">×</span>
                                <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered w-full" placeholder="Rows"/>
                            </div>
                        </div>

                        {/* Dimensions */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Dimensions</label>
                            <div className="flex items-center gap-2">
                                <input type="text" value={width} onChange={(e) => handleWidthChange((e.currentTarget as any).value)} className="input input-sm input-bordered w-full" placeholder="Width"/>
                                <button onClick={() => setIsLocked(l => !l)} className="btn btn-sm btn-ghost btn-square">{isLocked ? <LinkIcon/> : <LinkOffIcon/>}</button>
                                <input type="text" value={height} onChange={(e) => handleHeightChange((e.currentTarget as any).value)} className="input input-sm input-bordered w-full" placeholder="Height"/>
                            </div>
                            <select 
                                className="select select-sm select-bordered w-full mt-2"
                                onChange={e => {
                                    const value = (e.currentTarget as any).value;
                                    if (value) {
                                        const [w, h] = value.split('x').map(Number);
                                        applyPreset({ width: w, height: h });
                                    }
                                }}
                                value={width && height ? `${width}x${height}` : ""}
                            >
                                <option value="" disabled>Or select a preset...</option>
                                {COMPOSER_PRESETS.map(cat => (
                                    <optgroup key={cat.category} label={cat.category}>
                                        {cat.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name} ({p.width}x{p.height})</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        
                        {/* Style */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Style</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="label-text text-xs">Spacing</label>
                                    <input type="range" min="0" max="64" value={spacing} onChange={(e) => setSpacing(parseInt((e.currentTarget as any).value, 10))} className="range range-xs" />
                                </div>
                                <div>
                                    <label className="label-text text-xs">Bg Color</label>
                                    <input type="color" value={bgColor} onChange={(e) => setBgColor((e.currentTarget as any).value)} className="input input-sm h-8 w-full" />
                                </div>
                            </div>
                        </div>

                        {/* Image Fit */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Image Fit</label>
                            <div className="join w-full">
                                <button onClick={() => setStoredImageFit('cover')} className={`join-item btn btn-sm flex-1 ${imageFit === 'cover' ? 'btn-active' : ''}`}>Cover</button>
                                <button onClick={() => setStoredImageFit('contain')} className={`join-item btn btn-sm flex-1 ${imageFit === 'contain' ? 'btn-active' : ''}`}>Contain</button>
                            </div>
                            <p className="text-[10px] text-base-content/60 mt-1">
                                {imageFit === 'contain' ? 'Scale & Pan allowed.' : 'Fixed fill.'}
                            </p>
                        </div>

                        {/* Output Format */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Output</label>
                            <select value={outputFormat} onChange={(e) => setOutputFormat((e.currentTarget as any).value)} className="select select-sm select-bordered w-full">
                                <option value="jpeg">JPEG</option>
                                <option value="png">PNG</option>
                            </select>
                        </div>
                        
                        <div className="divider"></div>
                        <div className="text-xs text-center text-base-content/50">
                            Ratio: {ratioText}
                        </div>
                    </div>
                    
                    <div className="p-4 border-t border-base-300 grid grid-cols-2 gap-2">
                        <button onClick={handleClearAll} className="btn btn-sm btn-error btn-outline">Reset</button>
                        <button onClick={handleDownload} disabled={isDownloading || gridItems.filter(Boolean).length === 0} className="btn btn-sm btn-primary">
                            {isDownloading ? <span className="loading loading-spinner loading-xs"></span> : <DownloadIcon className="w-4 h-4 mr-2"/>}
                            Download
                        </button>
                    </div>
                </aside>

                {/* Main Area */}
                <main className="lg:col-span-3 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0 relative overflow-hidden">
                    <div ref={previewContainerRef} className="flex-grow flex items-center justify-center p-8 bg-base-200/50 relative">
                        <div 
                            className="bg-white shadow-2xl transition-all duration-200"
                            style={{
                                width: gridPixelDimensions.width,
                                height: gridPixelDimensions.height,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                                gap: `${spacing}px`,
                                padding: `${spacing}px`,
                                backgroundColor: bgColor,
                            }}
                        >
                            {gridItems.map((item, index) => (
                                <div 
                                    key={index}
                                    className={`relative bg-base-200 border-2 border-dashed border-base-300 rounded-sm overflow-hidden flex items-center justify-center
                                        ${dragOverIndex === index ? 'border-primary bg-primary/10' : ''}
                                        ${item ? 'border-none' : ''}
                                    `}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, index)}
                                    draggable={!!item}
                                >
                                    {item ? (
                                        <GridCell 
                                            item={item} 
                                            imageFit={imageFit} 
                                            onRemove={() => handleRemoveImage(index)}
                                            onTransform={(t) => handleItemTransform(index, t)}
                                        />
                                    ) : (
                                        <div 
                                            className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-base-300/50 transition-colors"
                                            onClick={() => (fileInputRef.current as any)?.click()}
                                        >
                                            <UploadIcon className="w-6 h-6 text-base-content/20" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={(e) => handleAddFiles(Array.from((e.currentTarget as any).files))} multiple accept="image/*" className="hidden" />
                </main>
            </div>
        </div>
    );
};

export default ComposerPage;
