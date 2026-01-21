import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { UploadIcon, CloseIcon, LinkIcon, LinkOffIcon, ViewGridIcon, RefreshIcon, DownloadIcon, FolderClosedIcon } from './icons';
import useLocalStorage from '../utils/useLocalStorage';
import { COMPOSER_PRESETS, Preset } from '../constants';
import GalleryPickerModal from './GalleryPickerModal';
import type { GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';

// --- TYPES AND INTERFACES ---
type ImageItem = {
  file: File | null;
  id: string;
  originalUrl: string;
  width: number;
  height: number;
  scale: number;
  posX: number; // Percent -0.5 to 0.5
  posY: number; // Percent -0.5 to 0.5
}

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
                alt={item.file?.name || 'Library Image'} 
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
    
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTargetIndex, setPickerTargetIndex] = useState<number | null>(null);

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

    const handleGallerySelect = async (selectedItems: GalleryItem[]) => {
        const newItems = await Promise.all(selectedItems.map(async (gItem) => {
            const blob = await fileSystemManager.getFileAsBlob(gItem.urls[0]);
            if (!blob) return null;
            const url = URL.createObjectURL(blob);
            const img = new (window as any).Image();
            await new Promise(res => { img.onload = res; img.src = url; });
            return {
                file: null, id: gItem.id + Math.random().toString(36).substr(2, 5),
                originalUrl: url, width: img.naturalWidth, height: img.naturalHeight,
                scale: 1, posX: 0, posY: 0
            } as ImageItem;
        }));

        const validItems = newItems.filter((i): i is ImageItem => i !== null);
        setGridItems(current => {
            const updated = [...current];
            let added = 0;
            const start = pickerTargetIndex !== null ? pickerTargetIndex : 0;
            for (let i = start; i < updated.length && added < validItems.length; i++) {
                if (!updated[i]) updated[i] = validItems[added++];
            }
            for (let i = 0; i < updated.length && added < validItems.length; i++) {
                if (!updated[i]) updated[i] = validItems[added++];
            }
            return updated;
        });
    };

    const handleRemoveImage = (index: number) => {
        setGridItems(current => {
            const next = [...current];
            const item = next[index];
            if (item) URL.revokeObjectURL(item.originalUrl);
            next[index] = null;
            return next;
        });
    };

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
        <div className="h-full bg-base-100 flex flex-col overflow-hidden">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 flex flex-col border-r border-base-300 overflow-hidden">
                    <header className="p-6 border-b border-base-300 bg-base-200/10">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">System Config</h3>
                    </header>
                    <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Grid Geometry</label>
                            <div className="flex items-center gap-4">
                                <input type="number" value={columns} onChange={(e) => setColumns(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered rounded-none w-full text-center font-bold" placeholder="Cols"/>
                                <span className="text-base-content/20 font-black">×</span>
                                <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt((e.currentTarget as any).value) || 1))} className="input input-sm input-bordered rounded-none w-full text-center font-bold" placeholder="Rows"/>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Output Matrix</label>
                            <div className="flex items-center gap-2">
                                <input type="text" value={width} onChange={(e) => handleWidthChange((e.currentTarget as any).value)} className="input input-sm input-bordered rounded-none w-full font-mono text-xs" placeholder="W"/>
                                <button onClick={() => setIsLocked(!isLocked)} className={`btn btn-xs btn-ghost rounded-none ${isLocked ? 'text-primary' : 'opacity-20'}`}>{isLocked ? <LinkIcon className="w-4 h-4"/> : <LinkOffIcon className="w-4 h-4"/>}</button>
                                <input type="text" value={height} onChange={(e) => handleHeightChange((e.currentTarget as any).value)} className="input input-sm input-bordered rounded-none w-full font-mono text-xs" placeholder="H"/>
                            </div>
                             <select className="select select-xs select-bordered rounded-none w-full font-bold uppercase tracking-tight" onChange={e => { const [w, h] = (e.currentTarget as any).value.split('x'); setWidth(w); setHeight(h); }} value={`${width}x${height}`}>
                                <option value="" disabled>Resolution Presets</option>
                                {COMPOSER_PRESETS.flatMap(c => c.presets).map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="space-y-6">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Visual Params</label>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between mb-2"><span className="text-[10px] font-black uppercase text-base-content/30">Gap Spacing</span><span className="text-[10px] font-mono font-bold">{spacing}PX</span></div>
                                    <input type="range" min="0" max="100" value={spacing} onChange={(e) => setSpacing(parseInt((e.currentTarget as any).value))} className="range range-xs range-primary" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase text-base-content/30">Background</span>
                                    <input type="color" value={bgColor} onChange={(e) => setBgColor((e.currentTarget as any).value)} className="w-8 h-8 rounded-none cursor-pointer border border-base-300 p-0 overflow-hidden" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Scaling Logic</label>
                            <div className="join w-full">
                                <button onClick={() => setStoredImageFit('cover')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${imageFit === 'cover' ? 'btn-active' : ''}`}>COVER</button>
                                <button onClick={() => setStoredImageFit('contain')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${imageFit === 'contain' ? 'btn-active' : ''}`}>CONTAIN</button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Export Format</label>
                            <select value={outputFormat} onChange={(e) => setOutputFormat((e.currentTarget as any).value as any)} className="select select-sm select-bordered rounded-none w-full font-bold uppercase tracking-tight">
                                <option value="jpeg">JPEG (High Quality)</option>
                                <option value="png">PNG (Lossless)</option>
                            </select>
                        </div>
                    </div>
                    
                    <footer className="p-4 border-t border-base-300 grid grid-cols-2 gap-2 bg-base-200/20">
                        <button onClick={() => setGridItems(Array(columns * rows).fill(null))} className="btn btn-sm btn-ghost rounded-none font-black text-[9px] tracking-widest text-error/40 hover:text-error">PURGE</button>
                        <button onClick={handleDownload} disabled={isDownloading || !gridItems.some(Boolean)} className="btn btn-sm btn-primary rounded-none font-black text-[9px] tracking-widest">
                            {isDownloading ? 'EXPORTING...' : 'DOWNLOAD'}
                        </button>
                    </footer>
                </aside>

                <main ref={previewContainerRef} className="flex-grow bg-base-200/20 flex items-center justify-center p-12 relative overflow-hidden">
                    {gridPixelDimensions.width > 0 && (
                        <div 
                            className="shadow-2xl transition-all duration-300 ease-in-out relative border border-base-300"
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
                                >
                                    {item ? (
                                        <GridCell 
                                            item={item} 
                                            imageFit={imageFit} 
                                            onRemove={() => handleRemoveImage(idx)}
                                            onTransform={t => handleItemTransform(idx, t)}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 group/slot">
                                            <div className="flex gap-2 opacity-0 group-hover/slot:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => (fileInputRef.current as any).click()}
                                                    className="btn btn-xs btn-ghost border border-base-300 rounded-none font-black text-[8px] tracking-widest"
                                                >
                                                    UPLOAD
                                                </button>
                                                <button 
                                                    onClick={() => { setPickerTargetIndex(idx); setIsPickerOpen(true); }}
                                                    className="btn btn-xs btn-primary rounded-none font-black text-[8px] tracking-widest"
                                                >
                                                    LIBRARY
                                                </button>
                                            </div>
                                            <div className="flex flex-col items-center opacity-10">
                                                <UploadIcon className="w-8 h-8 mb-1" />
                                                <span className="text-[8px] font-black uppercase tracking-widest">SLOT {idx + 1}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={e => handleAddFiles(Array.from((e.currentTarget as any).files))} multiple accept="image/*" className="hidden" />
                </main>
            </div>
            
            <GalleryPickerModal 
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={handleGallerySelect}
                selectionMode="multiple"
                typeFilter="image"
                title="Select images for grid"
            />
        </div>
    );
};

export default ComposerPage;