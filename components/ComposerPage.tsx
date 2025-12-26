
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
  posX: number; // Percent -0.5 to 0.5
  posY: number; // Percent -0.5 to 0.5
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
        if (imageFit !== 'contain') return; 
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.max(0.1, Math.min(item.scale + delta, 10));
        onTransform({ scale: newScale });
    };
    
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || imageFit !== 'contain') return;
        e.preventDefault();
        isPanning.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as any).style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanning.current || imageFit !== 'contain' || !containerRef.current) return;
        const rect = (containerRef.current as any).getBoundingClientRect();
        
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        
        // Convert pixel drag to percentage of cell
        const dxPercent = dx / rect.width;
        const dyPercent = dy / rect.height;
        
        onTransform({ 
            posX: item.posX + dxPercent, 
            posY: item.posY + dyPercent 
        });
    };
    
    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        isPanning.current = false;
        if (imageFit === 'contain') {
            (e.currentTarget as any).style.cursor = 'grab';
        }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        isPanning.current = false;
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
                    transform: `translate(${item.posX * 100}%, ${item.posY * 100}%) scale(${item.scale})`
                }}
                alt={item.file.name} 
                draggable="false"
            />
            {isHovered && imageFit === 'contain' && (
                <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
            )}
             <button onClick={onRemove} className="btn btn-xs btn-circle btn-error absolute -top-1 -right-1 z-10 opacity-0 group-hover:opacity-100 shadow-sm">
                <CloseIcon className="w-3 h-3"/>
            </button>
            {isHovered && imageFit === 'contain' && (
                <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-2 bg-black/60 p-1.5 rounded-full backdrop-blur-md pointer-events-auto shadow-lg">
                    <input 
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.01"
                        value={item.scale}
                        onChange={(e) => onTransform({ scale: parseFloat((e.currentTarget as any).value) })}
                        className="range range-xs range-primary flex-grow"
                    />
                    <button onClick={handleReset} className="btn btn-xs btn-ghost btn-circle text-white" title="Reset">
                        <RefreshIcon className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};


const ComposerPage: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const dragItemIndex = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Settings State
    const [columns, setColumns] = useLocalStorage('composerCols', 3);
    const [rows, setRows] = useLocalStorage('composerRows', 3);
    const [spacing, setSpacing] = useLocalStorage('composerSpacing', 8);
    const [storedImageFit, setStoredImageFit] = useLocalStorage<'cover' | 'contain'>('composerFit', 'contain');
    const [outputFormat, setOutputFormat] = useLocalStorage<'png' | 'jpeg'>('composerFormat', 'jpeg');
    const [bgColor, setBgColor] = useLocalStorage('composerBgColor', '#FFFFFF');
    const [width, setWidth] = useLocalStorage('composerWidth', '1024');
    const [height, setHeight] = useLocalStorage('composerHeight', '1024');
    const [isLocked, setIsLocked] = useLocalStorage('composerLock', true);
    
    const [gridItems, setGridItems] = useState<(ImageItem | null)[]>([]);
    const [gridPixelDimensions, setGridPixelDimensions] = useState({ width: 0, height: 0 });

    // SyncFit
    const imageFit = useMemo(() => storedImageFit, [storedImageFit]);

    // Update grid size
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

    // Normalized scale factor for visual consistency in preview
    const previewScale = useMemo(() => {
        const outW = parseInt(width, 10) || 1024;
        return gridPixelDimensions.width > 0 ? gridPixelDimensions.width / outW : 1;
    }, [width, gridPixelDimensions.width]);

    useLayoutEffect(() => {
        const container = previewContainerRef.current;
        if (!container || typeof window === 'undefined') return;

        const updateDimensions = () => {
            const numW = parseInt(width, 10);
            const numH = parseInt(height, 10);
            if (!numW || !numH) return;
            
            const targetAspect = numW / numH;
            const containerWidth = (container as any).offsetWidth - 64; // Padding
            const containerHeight = (container as any).offsetHeight - 64;

            let gridW, gridH;
            if (containerWidth / containerHeight > targetAspect) {
                gridH = containerHeight;
                gridW = containerHeight * targetAspect;
            } else {
                gridW = containerWidth;
                gridH = containerWidth / targetAspect;
            }
            setGridPixelDimensions({ width: gridW, height: gridH });
        };
        
        const observer = new (window as any).ResizeObserver(updateDimensions);
        observer.observe(container);
        updateDimensions();
        return () => observer.disconnect();
    }, [width, height]);

    // Handlers
    const handleWidthChange = (val: string) => {
        const numW = parseInt(val, 10) || 0;
        setWidth(val);
        if (isLocked && numW > 0) {
            const oldW = parseInt(width, 10) || 1024;
            const oldH = parseInt(height, 10) || 1024;
            setHeight(String(Math.round(numW * (oldH / oldW))));
        }
    };

    const handleHeightChange = (val: string) => {
        const numH = parseInt(val, 10) || 0;
        setHeight(val);
        if (isLocked && numH > 0) {
            const oldW = parseInt(width, 10) || 1024;
            const oldH = parseInt(height, 10) || 1024;
            setWidth(String(Math.round(numH * (oldW / oldH))));
        }
    };
    
    const handleAddFiles = useCallback(async (files: File[], dropIndex?: number) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        const newItems = await Promise.all(imageFiles.map(file => new Promise<ImageItem>(res => {
            const url = URL.createObjectURL(file);
            const img = new (window as any).Image();
            img.onload = () => res({
                file, id: Math.random().toString(36).substr(2, 9),
                originalUrl: url, width: img.naturalWidth, height: img.naturalHeight,
                scale: 1, posX: 0, posY: 0
            });
            img.src = url;
        })));

        setGridItems(current => {
            const updated = [...current];
            let added = 0;
            const start = dropIndex !== undefined ? dropIndex : 0;
            for (let i = start; i < updated.length && added < newItems.length; i++) {
                if (!updated[i]) updated[i] = newItems[added++];
            }
            // Fill remaining if dropIndex was used
            for (let i = 0; i < updated.length && added < newItems.length; i++) {
                if (!updated[i]) updated[i] = newItems[added++];
            }
            return updated;
        });
    }, []);

    // --- FIX: Added handleRemoveImage ---
    const handleRemoveImage = (index: number) => {
        setGridItems(current => {
            const next = [...current];
            const item = next[index];
            if (item) URL.revokeObjectURL(item.originalUrl);
            next[index] = null;
            return next;
        });
    };

    // --- FIX: Added handleItemTransform ---
    const handleItemTransform = (index: number, transform: { scale?: number; posX?: number; posY?: number }) => {
        setGridItems(current => {
            const next = [...current];
            const item = next[index];
            if (!item) return current;
            next[index] = { ...item, ...transform };
            return next;
        });
    };

    const handleDownload = async () => {
        if (!gridPixelDimensions.width) return;
        setIsDownloading(true);
        
        const outW = parseInt(width, 10);
        const outH = parseInt(height, 10);
        const canvas = (window as any).document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, outW, outH);

        const cellW = (outW - (spacing * (columns - 1))) / columns;
        const cellH = (outH - (spacing * (rows - 1))) / rows;

        for (let i = 0; i < gridItems.length; i++) {
            const item = gridItems[i];
            if (!item) continue;

            const col = i % columns;
            const row = Math.floor(i / columns);
            const x = col * (cellW + spacing);
            const y = row * (cellH + spacing);

            const img = new (window as any).Image();
            img.src = item.originalUrl;
            await new Promise(res => img.onload = res);

            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, cellW, cellH);
            ctx.clip();

            if (imageFit === 'cover') {
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const cellAspect = cellW / cellH;
                let sw, sh, sx, sy;
                if (imgAspect > cellAspect) {
                    sh = img.naturalHeight;
                    sw = sh * cellAspect;
                    sx = (img.naturalWidth - sw) / 2;
                    sy = 0;
                } else {
                    sw = img.naturalWidth;
                    sh = sw / cellAspect;
                    sx = 0;
                    sy = (img.naturalHeight - sh) / 2;
                }
                ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
            } else {
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const cellAspect = cellW / cellH;
                let dw, dh;
                if (imgAspect > cellAspect) {
                    dw = cellW;
                    dh = cellW / imgAspect;
                } else {
                    dh = cellH;
                    dw = cellH * imgAspect;
                }
                
                const finalScale = item.scale;
                const scaledW = dw * finalScale;
                const scaledH = dh * finalScale;
                
                const dx = x + (cellW - dw) / 2 + (item.posX * cellW) - (scaledW - dw) / 2;
                const dy = y + (cellH - dh) / 2 + (item.posY * cellH) - (scaledH - dh) / 2;
                
                ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, scaledW, scaledH);
            }
            ctx.restore();
        }

        const dataUrl = canvas.toDataURL(`image/${outputFormat}`, 0.95);
        const link = (window as any).document.createElement('a');
        link.download = `composed-grid-${Date.now()}.${outputFormat}`;
        link.href = dataUrl;
        link.click();
        setIsDownloading(false);
    };

    return (
        <div className="p-6 bg-base-200 h-full flex flex-col gap-6 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-0">
                <aside className="lg:col-span-1 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0 text-sm border border-base-300">
                    <div className="p-4 border-b border-base-300 font-bold text-lg flex items-center gap-2">
                        <ViewGridIcon className="w-5 h-5 text-primary"/> Grid Composer
                    </div>
                    <div className="flex-grow p-4 space-y-5 overflow-y-auto">
                        <div className="form-control">
                            <label className="label-text pb-2 font-semibold">Grid Layout</label>
                            <div className="flex items-center gap-3">
                                <input type="number" value={columns} onChange={(e) => setColumns(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered w-full text-center" placeholder="Cols"/>
                                <span className="opacity-40">×</span>
                                <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered w-full text-center" placeholder="Rows"/>
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="label-text pb-2 font-semibold">Resolution</label>
                            <div className="flex items-center gap-2">
                                <input type="text" value={width} onChange={(e) => handleWidthChange((e.currentTarget as any).value)} className="input input-sm input-bordered w-full" placeholder="W"/>
                                <button onClick={() => setIsLocked(!isLocked)} className={`btn btn-xs btn-ghost ${isLocked ? 'text-primary' : 'opacity-30'}`}>{isLocked ? <LinkIcon className="w-4 h-4"/> : <LinkOffIcon className="w-4 h-4"/>}</button>
                                <input type="text" value={height} onChange={(e) => handleHeightChange((e.currentTarget as any).value)} className="input input-sm input-bordered w-full" placeholder="H"/>
                            </div>
                             <select className="select select-xs select-bordered w-full mt-2" onChange={e => { const [w, h] = (e.currentTarget as any).value.split('x'); setWidth(w); setHeight(h); }} value={`${width}x${height}`}>
                                <option value="" disabled>Presets...</option>
                                {COMPOSER_PRESETS.flatMap(c => c.presets).map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="form-control">
                            <label className="label-text pb-2 font-semibold">Appearance</label>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between mb-1"><span className="text-[10px] uppercase opacity-60">Spacing</span><span className="text-[10px] font-mono">{spacing}px</span></div>
                                    <input type="range" min="0" max="100" value={spacing} onChange={(e) => setSpacing(parseInt((e.currentTarget as any).value))} className="range range-xs range-primary" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase opacity-60">Background</span>
                                    <input type="color" value={bgColor} onChange={(e) => setBgColor((e.currentTarget as any).value)} className="w-8 h-8 rounded cursor-pointer border-none p-0 overflow-hidden" />
                                </div>
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="label-text pb-2 font-semibold">Image Fitting</label>
                            <div className="join w-full">
                                <button onClick={() => setStoredImageFit('cover')} className={`join-item btn btn-xs flex-1 ${imageFit === 'cover' ? 'btn-active' : ''}`}>Cover</button>
                                <button onClick={() => setStoredImageFit('contain')} className={`join-item btn btn-xs flex-1 ${imageFit === 'contain' ? 'btn-active' : ''}`}>Contain</button>
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="label-text pb-2 font-semibold">Format</label>
                            <select value={outputFormat} onChange={(e) => setOutputFormat((e.currentTarget as any).value as any)} className="select select-sm select-bordered w-full">
                                <option value="jpeg">JPEG (High Quality)</option>
                                <option value="png">PNG (Lossless)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="p-4 border-t border-base-300 grid grid-cols-2 gap-2 bg-base-200/30">
                        <button onClick={() => setGridItems(Array(columns * rows).fill(null))} className="btn btn-sm btn-outline btn-error">Clear</button>
                        <button onClick={handleDownload} disabled={isDownloading || !gridItems.some(Boolean)} className="btn btn-sm btn-primary">
                            {isDownloading ? <span className="loading loading-spinner loading-xs"></span> : <DownloadIcon className="w-4 h-4 mr-1"/>}
                            Export
                        </button>
                    </div>
                </aside>

                <main ref={previewContainerRef} className="lg:col-span-3 bg-base-300 rounded-xl shadow-inner flex items-center justify-center p-8 relative overflow-hidden">
                    {gridPixelDimensions.width > 0 && (
                        <div 
                            className="shadow-2xl transition-all duration-200 ease-in-out relative"
                            style={{
                                width: gridPixelDimensions.width,
                                height: gridPixelDimensions.height,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                                gap: `${spacing * previewScale}px`,
                                padding: `${spacing * previewScale}px`,
                                backgroundColor: bgColor,
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                if ((e.dataTransfer as any).files.length) handleAddFiles(Array.from((e.dataTransfer as any).files));
                            }}
                        >
                            {gridItems.map((item, idx) => (
                                <div 
                                    key={idx}
                                    className={`relative bg-base-100/30 border border-dashed border-base-content/10 flex items-center justify-center overflow-hidden
                                        ${dragOverIndex === idx ? 'ring-2 ring-primary ring-inset' : ''}
                                        ${item ? 'border-none' : 'hover:bg-base-100/50 transition-colors cursor-pointer'}
                                    `}
                                    onDragStart={e => { if (item) { dragItemIndex.current = idx; (e.dataTransfer as any).effectAllowed = 'move'; } }}
                                    onDragOver={e => { e.preventDefault(); setDragOverIndex(idx); }}
                                    onDragLeave={() => setDragOverIndex(null)}
                                    onDrop={e => {
                                        e.preventDefault();
                                        setDragOverIndex(null);
                                        if ((e.dataTransfer as any).files.length) {
                                            handleAddFiles(Array.from((e.dataTransfer as any).files), idx);
                                        } else if (dragItemIndex.current !== null) {
                                            const from = dragItemIndex.current;
                                            setGridItems(prev => {
                                                const next = [...prev];
                                                [next[from], next[idx]] = [next[idx], next[from]];
                                                return next;
                                            });
                                            dragItemIndex.current = null;
                                        }
                                    }}
                                    draggable={!!item}
                                    onClick={() => !item && (fileInputRef.current as any).click()}
                                >
                                    {item ? (
                                        <GridCell 
                                            item={item} 
                                            imageFit={imageFit} 
                                            onRemove={() => handleRemoveImage(idx)}
                                            onTransform={t => handleItemTransform(idx, t)}
                                        />
                                    ) : (
                                        <UploadIcon className="w-6 h-6 opacity-10" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={e => handleAddFiles(Array.from((e.currentTarget as any).files))} multiple accept="image/*" className="hidden" />
                </main>
            </div>
        </div>
    );
};

export default ComposerPage;
