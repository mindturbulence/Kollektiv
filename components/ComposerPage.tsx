
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { 
    UploadIcon, CloseIcon, LinkIcon, LinkOffIcon, RefreshIcon, 
    DownloadIcon, FolderClosedIcon, PlusIcon, GripVerticalIcon, 
    DeleteIcon, CheckIcon, ArchiveIcon, SparklesIcon, ChevronDownIcon,
    CenterIcon, PhotoIcon, ViewColumnsIcon
} from './icons';
import useLocalStorage from '../utils/useLocalStorage';
import GalleryPickerModal from './GalleryPickerModal';
import type { GalleryItem } from '../types';
import { fileSystemManager, fileToBase64 } from '../utils/fileUtils';
import { addItemToGallery } from '../utils/galleryStorage';
import LoadingSpinner from './LoadingSpinner';
import ConfirmationModal from './ConfirmationModal';

// --- TYPES ---
type EditorMode = 'grid' | 'frame';
type FrameStyle = 'minimal' | 'polaroid' | 'leica' | 'film' | 'museum' | 'bottom_only' | 'vertical_mat' | 'minimal_footer';
type FitMode = 'cover' | 'contain';

interface Layer {
    id: string;
    type: 'text' | 'image';
    content: string; 
    x: number; // 0.0 - 1.0
    y: number; // 0.0 - 1.0
    fontSize: number; 
    color: string;
    fontFamily: string;
    bold: boolean;
    italic: boolean;
}

interface ImageItem {
  id: string;
  url: string;
  width: number;
  height: number;
  scale: number;
  posX: number;
  posY: number;
  fit: FitMode;
}

interface ComposerPageProps {
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

// --- CONSTANTS ---
const FONTS = [
    { name: 'Satoshi', family: "'Satoshi', sans-serif" },
    { name: 'General Sans', family: "'General Sans', sans-serif" },
    { name: 'Space Mono', family: "'Space Mono', monospace" },
    { name: 'Clash Display', family: "'Clash Display', sans-serif" },
    { name: 'Inter', family: "'Inter', sans-serif" }
];

const RATIOS = [
    { label: '1:1 Square', value: '1:1', ratio: 1 },
    { label: '4:5 Portrait', value: '4:5', ratio: 0.8 },
    { label: '9:16 Story', value: '9:16', ratio: 0.5625 },
    { label: '16:9 Landscape', value: '16:9', ratio: 1.777 },
    { label: '2:3 Classic', value: '2:3', ratio: 0.666 },
    { label: '3:2 Photo', value: '3:2', ratio: 1.5 },
];

// --- HELPERS ---

const calculateDrawMetrics = (imgW: number, imgH: number, contW: number, contH: number, fit: FitMode) => {
    const imgAspect = imgW / imgH;
    const contAspect = contW / contH;
    let dw, dh;
    if (fit === 'cover' ? imgAspect > contAspect : imgAspect < contAspect) {
        dh = contH; dw = contH * imgAspect;
    } else {
        dw = contW; dh = contW / imgAspect;
    }
    return { dw, dh };
};

const getFrameInsets = (style: FrameStyle, size: number, w: number) => {
    const s = Math.min(size, w * 0.25);
    switch (style) {
        case 'polaroid': return [s, s, s * 6, s];
        case 'bottom_only': return [s * 0.5, s * 0.5, s * 4, s * 0.5];
        case 'leica': return [s * 0.8, s * 0.8, s * 3, s * 0.8];
        case 'vertical_mat': return [s * 5, s, s * 5, s];
        default: return [s, s, s, s];
    }
};

// --- RENDERER COMPONENTS ---

const ItemRenderer: React.FC<{
    item: ImageItem;
    w: number;
    h: number;
    onTransform: (t: Partial<ImageItem>) => void;
    onRemove: () => void;
    animateEntry?: boolean;
}> = ({ item, w, h, onTransform, onRemove, animateEntry }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [panning, setPanning] = useState(false);
    const startPos = useRef({ px: item.posX, py: item.posY, mx: 0, my: 0 });
    const { dw, dh } = calculateDrawMetrics(item.width, item.height, w, h, item.fit);

    useLayoutEffect(() => {
        if (animateEntry && containerRef.current) {
            gsap.fromTo(containerRef.current, 
                { autoAlpha: 0, scale: 0.95, filter: 'blur(10px)' },
                { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.8, ease: "power4.out" }
            );
        }
    }, [animateEntry, item.id]);

    const handleDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        setPanning(true);
        startPos.current = { px: item.posX, py: item.posY, mx: e.clientX, my: e.clientY };
    };

    useEffect(() => {
        if (!panning) return;
        const move = (e: MouseEvent) => onTransform({ 
            posX: startPos.current.px + (e.clientX - startPos.current.mx) / w, 
            posY: startPos.current.py + (e.clientY - startPos.current.my) / h 
        });
        const up = () => setPanning(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [panning, w, h, onTransform]);

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        onTransform({ scale: Math.max(0.1, Math.min(10, item.scale + delta)) });
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative overflow-hidden group cursor-grab active:cursor-grabbing bg-base-300" 
            onMouseDown={handleDown}
            onWheel={handleWheel}
        >
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-75"
                 style={{ transform: `translate(${item.posX * w}px, ${item.posY * h}px) scale(${item.scale})` }}>
                <img src={item.url} style={{ width: dw, height: dh, maxWidth: 'none' }} alt="Item" draggable={false} />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                <div className="flex gap-1 pointer-events-auto">
                    <button onClick={(e) => { e.stopPropagation(); onTransform({ fit: item.fit === 'cover' ? 'contain' : 'cover' }); }} className="btn btn-xs rounded-none bg-black/40 border-none text-[8px] font-black">{item.fit === 'cover' ? 'FILL' : 'FIT'}</button>
                </div>
                <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove(); }} className="btn btn-xs btn-circle btn-error pointer-events-auto border-none">✕</button>
            </div>
        </div>
    );
};

const LayerRenderer: React.FC<{
    layer: Layer;
    isActive: boolean;
    scale: number;
    contW: number;
    contH: number;
    onActivate: () => void;
    onUpdate: (u: Partial<Layer>) => void;
}> = ({ layer, isActive, scale, contW, contH, onActivate, onUpdate }) => {
    const [dragging, setDragging] = useState(false);
    const start = useRef({ x: layer.x, y: layer.y, mx: 0, my: 0 });

    const handleDown = (e: React.MouseEvent) => {
        e.stopPropagation(); onActivate();
        if (e.button !== 0) return;
        e.preventDefault(); setDragging(true);
        start.current = { x: layer.x, y: layer.y, mx: e.clientX, my: e.clientY };
    };

    useEffect(() => {
        if (!dragging) return;
        const move = (e: MouseEvent) => onUpdate({ 
            x: start.current.x + (e.clientX - start.current.mx) / contW, 
            y: start.current.y + (e.clientY - start.current.my) / contH 
        });
        const up = () => setDragging(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [dragging, contW, contH, onUpdate]);

    return (
        <div className={`absolute select-none z-50 transition-shadow ${isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-black/50' : ''}`}
             style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: 'translate(-50%, -50%)', cursor: dragging ? 'grabbing' : 'grab' }}
             onMouseDown={handleDown} onClick={e => e.stopPropagation()}>
            {layer.type === 'text' ? (
                <span style={{ fontSize: `${layer.fontSize * scale}px`, color: layer.color, fontFamily: layer.fontFamily, fontWeight: layer.bold ? 'bold' : 'normal', fontStyle: layer.italic ? 'italic' : 'normal', whiteSpace: 'nowrap' }}>
                    {layer.content || 'New Text'}
                </span>
            ) : (
                <img src={layer.content} style={{ width: `${layer.fontSize * 5 * scale}px`, height: 'auto', pointerEvents: 'none' }} draggable={false} />
            )}
        </div>
    );
};

// --- MAIN PAGE ---

const ComposerPage: React.FC<ComposerPageProps> = ({ showGlobalFeedback }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const layerImageInputRef = useRef<HTMLInputElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const framePaddingRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useLocalStorage<EditorMode>('composerMode', 'grid');
    const [aspectRatio, setAspectRatio] = useLocalStorage('composerAspectRatio', '1:1');
    const [width, setWidth] = useLocalStorage('composerWidth', '1024');
    const [height, setHeight] = useLocalStorage('composerHeight', '1024');
    const [isLocked, setIsLocked] = useLocalStorage('composerLock', true);
    
    const [gridCols, setGridCols] = useLocalStorage('composerCols', 3);
    const [gridRows, setGridRows] = useLocalStorage('composerRows', 3);
    const [gridGap, setGridGap] = useLocalStorage('composerGridGap', 20);
    
    const [frameStyle, setFrameStyle] = useLocalStorage<FrameStyle>('composerFrameStyle', 'minimal');
    const [frameMatting, setFrameMatting] = useLocalStorage('composerFrameMatting', 60);
    
    const [bgColor, setBgColor] = useLocalStorage('composerBgColor', '#FFFFFF');
    const [outputFormat, setOutputFormat] = useLocalStorage<'png' | 'jpeg'>('composerFormat', 'jpeg');

    const [gridItems, setGridItems] = useState<(ImageItem | null)[]>([]);
    const [frameItem, setFrameItem] = useState<ImageItem | null>(null);
    const [layers, setLayers] = useState<Layer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [previewMetrics, setPreviewMetrics] = useState({ width: 0, height: 0, scale: 1 });
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<number | null>(null);
    const [isVaultConfirmOpen, setIsVaultConfirmOpen] = useState(false);

    useEffect(() => {
        if (mode === 'grid') {
            const size = gridCols * gridRows;
            setGridItems(prev => {
                const next = Array(size).fill(null);
                prev.slice(0, size).forEach((item, i) => next[i] = item);
                return next;
            });
            setActiveLayerId(null);
        }
    }, [gridCols, gridRows, mode]);

    useLayoutEffect(() => {
        const container = previewContainerRef.current;
        if (!container) return;
        const update = () => {
            const tw = parseInt(width) || 1024, th = parseInt(height) || 1024;
            const cw = container.offsetWidth - 96, ch = container.offsetHeight - 96;
            const aspect = tw / th;
            let pw, ph;
            if (cw / ch > aspect) { ph = ch; pw = ch * aspect; }
            else { pw = cw; ph = cw / aspect; }
            setPreviewMetrics({ width: pw, height: ph, scale: pw / tw });
        };
        const obs = new ResizeObserver(update); obs.observe(container); update();
        return () => obs.disconnect();
    }, [width, height]);

    // --- GSAP INTEGRATION FOR PHOTO FRAMER ---
    useLayoutEffect(() => {
        if (mode === 'frame' && framePaddingRef.current) {
            const [t, r, b, l] = getFrameInsets(frameStyle, frameMatting, parseInt(width));
            const s = previewMetrics.scale;
            
            gsap.to(framePaddingRef.current, {
                paddingTop: t * s,
                paddingRight: r * s,
                paddingBottom: b * s,
                paddingLeft: l * s,
                duration: 0.6,
                ease: "power4.out",
                overwrite: 'auto'
            });
        }
    }, [mode, frameStyle, frameMatting, width, previewMetrics.scale]);

    // Handle 50% Spacing Restriction
    const handleGapChange = (val: number) => {
        const tw = parseInt(width) || 1024;
        const maxTotalGapsWidth = tw * 0.5; // Strictly capped at 50% of canvas
        const totalGapsCount = gridCols + 1;
        const maxGapPerGutter = maxTotalGapsWidth / totalGapsCount;
        
        // Slider max is 256. 256 = maxGapPerGutter
        const calculatedGap = (val / 256) * maxGapPerGutter;
        setGridGap(Math.round(calculatedGap));
    };

    const handleFiles = async (files: File[], targetIdx?: number) => {
        const items = await Promise.all(files.filter(f => f.type.startsWith('image/')).map(file => new Promise<ImageItem>(res => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => res({ id: Math.random().toString(36).substr(2, 9), url: url, width: img.naturalWidth, height: img.naturalHeight, scale: 1, posX: 0, posY: 0, fit: 'cover' });
            img.src = url;
        })));
        if (mode === 'frame' && items.length) setFrameItem(items[0]);
        else setGridItems(prev => {
            const next = [...prev]; let cursor = targetIdx ?? 0;
            items.forEach(item => {
                while (cursor < next.length && next[cursor] !== null && targetIdx === undefined) cursor++;
                if (cursor < next.length) next[cursor++] = item;
            });
            return next;
        });
    };

    const handleLibrarySelect = async (items: GalleryItem[]) => {
        const valid = (await Promise.all(items.map(async g => {
            const blob = await fileSystemManager.getFileAsBlob(g.urls[0]);
            if (!blob) return null;
            const url = URL.createObjectURL(blob);
            const img = new Image(); await new Promise(r => { img.onload = r; img.src = url; });
            return { id: g.id, url: url, width: img.naturalWidth, height: img.naturalHeight, scale: 1, posX: 0, posY: 0, fit: 'cover' as FitMode };
        }))).filter((i): i is ImageItem => i !== null);
        if (mode === 'frame' && valid.length) setFrameItem(valid[0]);
        else setGridItems(prev => {
            const next = [...prev]; let cursor = pickerTarget ?? 0;
            valid.forEach(item => {
                while (cursor < next.length && next[cursor] !== null && pickerTarget === null) cursor++;
                if (cursor < next.length) next[cursor++] = item;
            });
            return next;
        });
    };

    const generateFinalCanvas = async (): Promise<HTMLCanvasElement | null> => {
        const outW = parseInt(width) || 1024, outH = parseInt(height) || 1024;
        const canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return null;
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, outW, outH);
        const drawList = mode === 'frame' ? (frameItem ? [frameItem] : []) : gridItems;
        for (let i = 0; i < drawList.length; i++) {
            const item = drawList[i]; if (!item) continue;
            let cx, cy, cw, ch;
            if (mode === 'frame') {
                const [pt, pr, pb, pl] = getFrameInsets(frameStyle, frameMatting, outW);
                cw = outW - (pr + pl); ch = outH - (pt + pb); cx = pl; cy = pt;
            } else {
                cw = (outW - (gridGap * (gridCols + 1))) / gridCols;
                ch = (outH - (gridGap * (gridRows + 1))) / gridRows;
                cx = gridGap + (i % gridCols) * (cw + gridGap); cy = gridGap + Math.floor(i / gridCols) * (ch + gridGap);
            }
            const img = new Image(); img.src = item.url; await new Promise(r => img.onload = r);
            ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
            const { dw, dh } = calculateDrawMetrics(img.naturalWidth, img.naturalHeight, cw, ch, item.fit);
            ctx.translate(cx + cw/2 + item.posX * cw, cy + ch/2 + item.posY * ch);
            ctx.scale(item.scale, item.scale); ctx.drawImage(img, -dw/2, -dh/2, dw, dh); ctx.restore();
        }
        if (mode === 'frame') {
            for (const layer of layers) {
                const sx = layer.x * outW, sy = layer.y * outH;
                ctx.save();
                if (layer.type === 'text') {
                    ctx.font = `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${layer.fontSize}px ${layer.fontFamily}`;
                    ctx.fillStyle = layer.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(layer.content, sx, sy);
                } else {
                    const img = new Image(); img.src = layer.content; await new Promise(r => img.onload = r);
                    const dw = layer.fontSize * 5, dh = dw * (img.naturalHeight / img.naturalWidth);
                    ctx.drawImage(img, sx - dw/2, sy - dh/2, dw, dh);
                }
                ctx.restore();
            }
        }
        return canvas;
    };

    const handleDownload = async () => {
        setIsProcessing(true); const canvas = await generateFinalCanvas();
        if (canvas) {
            const link = document.createElement('a'); link.download = `composition_${Date.now()}.${outputFormat}`;
            link.href = canvas.toDataURL(`image/${outputFormat}`, 0.95); link.click();
        }
        setIsProcessing(false);
    };

    const gridLayout = useMemo(() => {
        if (mode !== 'grid') return null;
        const { width: pw, height: ph, scale } = previewMetrics;
        const gap = gridGap * scale, cw = (pw - (gap * (gridCols + 1))) / gridCols, ch = (ph - (gap * (gridRows + 1))) / gridRows;
        return { cw, ch, gap };
    }, [mode, previewMetrics, gridCols, gridRows, gridGap]);

    return (
        <div className="h-full bg-base-100 flex flex-col overflow-hidden">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 border-r border-base-300 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-base-300 bg-base-200/10">
                        <div className="tabs tabs-boxed rounded-none bg-transparent gap-1 p-0">
                            <button onClick={() => setMode('grid')} className={`tab flex-1 rounded-none font-black text-[9px] uppercase tracking-widest ${mode === 'grid' ? 'tab-active' : ''}`}>Grid Builder</button>
                            <button onClick={() => setMode('frame')} className={`tab flex-1 rounded-none font-black text-[9px] uppercase tracking-widest ${mode === 'frame' ? 'tab-active' : ''}`}>Image Framer</button>
                        </div>
                    </div>
                    
                    <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Dimensions</label>
                            <select value={aspectRatio} onChange={e => { setAspectRatio(e.target.value); const ratio = RATIOS.find(r => r.value === e.target.value)?.ratio || 1; setWidth("1024"); setHeight(String(Math.round(1024 / ratio))); }} className="select select-sm select-bordered rounded-none w-full font-bold uppercase text-[10px] tracking-widest">
                                {RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <input type="number" value={width} onChange={e => { setWidth(e.target.value); if(isLocked) setHeight(String(Math.round(parseInt(e.target.value) * (parseInt(height)/parseInt(width))))); }} className="input input-sm input-bordered rounded-none w-full font-mono text-xs" />
                                <button onClick={() => setIsLocked(!isLocked)} className={`btn btn-xs btn-ghost ${isLocked ? 'text-primary' : 'opacity-20'}`}>{isLocked ? <LinkIcon className="w-4 h-4"/> : <LinkOffIcon className="w-4 h-4"/>}</button>
                                <input type="number" value={height} onChange={e => { setHeight(e.target.value); if(isLocked) setWidth(String(Math.round(parseInt(e.target.value) * (parseInt(width)/parseInt(height))))); }} className="input input-sm input-bordered rounded-none w-full font-mono text-xs" />
                            </div>
                        </div>

                        {mode === 'grid' ? (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Grid Rows & Cols</label>
                                    <div className="flex gap-4"><input type="number" value={gridCols} onChange={e => setGridCols(Math.max(1, parseInt(e.target.value)))} className="input input-sm input-bordered w-full rounded-none font-bold" /><span className="self-center font-black opacity-20">×</span><input type="number" value={gridRows} onChange={e => setGridRows(Math.max(1, parseInt(e.target.value)))} className="input input-sm input-bordered w-full rounded-none font-bold" /></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-base-content/20">Spacing</span></div>
                                    <input type="range" min="0" max="256" step="1" onChange={e => handleGapChange(parseInt(e.target.value))} className="range range-xs range-primary" />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Matting Style</label>
                                    <select value={frameStyle} onChange={e => setFrameStyle(e.target.value as FrameStyle)} className="select select-sm select-bordered rounded-none w-full font-bold uppercase text-[11px]"><option value="minimal">Minimal Uniform</option><option value="polaroid">Polaroid Weighted</option><option value="bottom_only">Gallery (Bottom Focus)</option><option value="leica">Leica Style</option><option value="vertical_mat">Vertical Offset</option></select>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-base-content/20">Depth</span><span className="text-[10px] font-mono font-bold text-primary">{frameMatting}PX</span></div>
                                    <input type="range" min="0" max={Math.floor(parseInt(width)*0.25)} value={frameMatting} onChange={e => setFrameMatting(parseInt(e.target.value))} className="range range-xs range-primary" />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 pt-6 border-t border-base-300">
                            <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Background</span><input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded-none border-none cursor-pointer" /></div>
                            <button onClick={() => { if(mode==='grid') setGridItems(prev => prev.map(i => i ? {...i, posX: 0, posY: 0, scale: 1} : null)); else { if(frameItem) setFrameItem({...frameItem, posX:0, posY:0, scale:1}); setLayers(prev => prev.map(s => ({...s, x:0.5, y:0.5}))); } }} className="btn btn-xs btn-ghost border border-base-300 rounded-none w-full font-black text-[9px] tracking-widest uppercase mt-4">Reset Viewport</button>
                        </div>
                    </div>

                    <footer className="border-t border-base-300 flex flex-col bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                         <div className="flex w-full h-14 border-b border-base-300">
                            <button onClick={() => { setGridItems(Array(gridCols*gridRows).fill(null)); setFrameItem(null); setLayers([]); }} className="btn btn-ghost flex-1 h-full rounded-none font-black text-[9px] tracking-widest uppercase text-error/40 hover:text-error">RESET</button>
                            <button onClick={handleDownload} disabled={isProcessing || (mode==='grid'?!gridItems.some(Boolean):!frameItem)} className="btn btn-ghost flex-1 h-full rounded-none font-black text-[9px] tracking-widest uppercase border-l border-base-300">DOWNLOAD</button>
                        </div>
                        <button onClick={() => setIsVaultConfirmOpen(true)} disabled={isProcessing || (mode==='grid'?!gridItems.some(Boolean):!frameItem)} className="btn btn-primary h-14 w-full rounded-none font-black text-[9px] tracking-[0.2em] uppercase shadow-none border-none">SAVE TO LIBRARY</button>
                    </footer>
                </aside>

                <main className="flex-grow flex flex-col bg-base-100 overflow-hidden relative">
                    <section className="p-8 border-b border-base-300 bg-base-200/10 flex justify-between items-center h-16"><h1 className="text-xl font-black uppercase tracking-tighter">{mode === 'grid' ? 'Grid Builder' : 'Image Framer'}<span className="text-primary">.</span></h1></section>
                    <div ref={previewContainerRef} className="flex-grow bg-base-200/5 flex items-center justify-center p-12 overflow-hidden" onMouseDown={e => { if(e.target === e.currentTarget) setActiveLayerId(null); }}>
                        <div id="framer-canvas-root" className="shadow-2xl relative transition-all duration-500 overflow-hidden" style={{ width: previewMetrics.width, height: previewMetrics.height, backgroundColor: bgColor }}>
                            {mode === 'grid' && gridLayout && gridItems.map((item, idx) => (
                                <div key={idx} className="absolute bg-base-300 overflow-hidden" style={{ width: gridLayout.cw, height: gridLayout.ch, left: gridLayout.gap + (idx % gridCols) * (gridLayout.cw + gridLayout.gap), top: gridLayout.gap + Math.floor(idx / gridCols) * (gridLayout.ch + gridLayout.gap) }}>
                                    {item ? <ItemRenderer item={item} w={gridLayout.cw} h={gridLayout.ch} onRemove={() => setGridItems(prev => { const n = [...prev]; n[idx]=null; return n; })} onTransform={t => setGridItems(prev => { const n = [...prev]; n[idx]={...item, ...t}; return n; })} /> 
                                    : <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-10 hover:opacity-40 transition-opacity">
                                        <button onClick={() => { setPickerTarget(idx); setIsPickerOpen(true); }} className="btn btn-circle btn-sm btn-ghost"><FolderClosedIcon className="w-8 h-8"/></button>
                                        <button onClick={() => { setPickerTarget(idx); (window as any).document.getElementById('grid-file-upload')?.click(); }} className="btn btn-circle btn-sm btn-ghost"><PlusIcon className="w-8 h-8"/></button>
                                    </div>}
                                </div>
                            ))}
                            {mode === 'frame' && (
                                <div className="w-full h-full relative">
                                    <div ref={framePaddingRef} className="w-full h-full will-change-[padding]">
                                        {frameItem ? <ItemRenderer animateEntry item={frameItem} w={previewMetrics.width - (getFrameInsets(frameStyle, frameMatting, parseInt(width))[1]+getFrameInsets(frameStyle, frameMatting, parseInt(width))[3])*previewMetrics.scale} h={previewMetrics.height - (getFrameInsets(frameStyle, frameMatting, parseInt(width))[0]+getFrameInsets(frameStyle, frameMatting, parseInt(width))[2])*previewMetrics.scale} onRemove={() => setFrameItem(null)} onTransform={t => setFrameItem({...frameItem!, ...t})} />
                                        : <div className="w-full h-full border-2 border-dashed border-base-content/10 flex flex-col items-center justify-center gap-4 opacity-40 hover:opacity-100 transition-opacity">
                                            <div className="flex gap-4">
                                                <button onClick={() => setIsPickerOpen(true)} className="btn btn-ghost border border-base-300 rounded-none font-black text-[10px] tracking-widest px-8">LIBRARY</button>
                                                <button onClick={() => (window as any).document.getElementById('frame-file-upload')?.click()} className="btn btn-primary rounded-none font-black text-[10px] tracking-widest px-8">UPLOAD</button>
                                            </div>
                                        </div>}
                                    </div>
                                    {layers.map(layer => (
                                        <LayerRenderer key={layer.id} layer={layer} isActive={activeLayerId === layer.id} scale={previewMetrics.scale} contW={previewMetrics.width} contH={previewMetrics.height} onActivate={() => setActiveLayerId(layer.id)} onUpdate={u => setLayers(prev => prev.map(s => s.id === layer.id ? {...s, ...u} : s))} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                {/* RIGHT SIDEBAR: LAYERS (IMAGE FRAMER ONLY) */}
                {mode === 'frame' && (
                    <aside className="w-full lg:w-80 flex-shrink-0 bg-base-100 border-l border-base-300 flex flex-col overflow-hidden animate-slide-in-from-right">
                        <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center h-16"><h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Layers</h3><div className="flex gap-1"><button onClick={() => { const n: Layer = { id: Math.random().toString(36).substr(2,9), type: 'text', content: 'New Text', x: 0.5, y: 0.5, fontSize: 80, color: '#000000', fontFamily: FONTS[0].family, bold: true, italic: false }; setLayers([...layers, n]); setActiveLayerId(n.id); }} className="btn btn-xs btn-ghost btn-square" title="Add Text Layer"><PlusIcon className="w-4 h-4"/></button><button onClick={() => layerImageInputRef.current?.click()} className="btn btn-xs btn-ghost btn-square" title="Add Image Layer"><UploadIcon className="w-4 h-4"/></button></div></header>
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-4">
                            {layers.map((layer, i) => (
                                <div key={layer.id} className={`p-4 border transition-all cursor-pointer ${activeLayerId === layer.id ? 'border-primary bg-primary/5' : 'border-base-300'}`} onClick={() => setActiveLayerId(layer.id)}>
                                    <div className="flex justify-between items-center mb-3"><span className="text-[9px] font-black uppercase tracking-widest opacity-40">Layer {String(i+1).padStart(2, '0')}</span><button onClick={e => { e.stopPropagation(); setLayers(prev => prev.filter(s => s.id !== layer.id)); }} className="text-error opacity-40 hover:opacity-100">✕</button></div>
                                    {layer.type === 'text' ? <input value={layer.content} onChange={e => setLayers(prev => prev.map(s => s.id === layer.id ? {...s, content: e.target.value} : s))} className="input input-xs w-full bg-base-200 rounded-none border-none uppercase font-bold" /> : <span className="text-[10px] font-mono opacity-30 truncate block">Image Overlay</span>}
                                    {activeLayerId === layer.id && (
                                        <div className="mt-4 pt-4 border-t border-base-300/50 space-y-4">
                                            <div className="flex justify-between items-center"><span className="text-[9px] font-black uppercase opacity-40 text-primary">Size</span><span className="text-[10px] font-mono font-bold text-primary">{layer.fontSize}PX</span></div>
                                            <input type="range" min="8" max="1500" value={layer.fontSize} onChange={e => { const v = parseInt(e.target.value); setLayers(prev => prev.map(s => s.id === layer.id ? {...s, fontSize: v} : s)); }} className="range range-xs range-primary" />
                                            {layer.type === 'text' && <select value={layer.fontFamily} onChange={e => setLayers(prev => prev.map(s => s.id === layer.id ? {...s, fontFamily: e.target.value} : s))} className="select select-xs select-bordered w-full rounded-none text-[10px] font-bold uppercase tracking-tight">{FONTS.map(f => <option key={f.family} value={f.family}>{f.name}</option>)}</select>}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {layers.length === 0 && (
                                <div className="py-12 text-center opacity-10 uppercase font-black tracking-widest text-xs">No layers added</div>
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {/* HIDDEN INPUTS */}
            <input type="file" id="grid-file-upload" className="hidden" multiple onChange={e => handleFiles(Array.from(e.target.files || []), pickerTarget ?? undefined)} />
            <input type="file" id="frame-file-upload" className="hidden" onChange={e => handleFiles(Array.from(e.target.files || []))} />
            <input type="file" ref={layerImageInputRef} className="hidden" onChange={async e => { if(e.target.files?.[0]) { const b64 = await fileToBase64(e.target.files[0]); const n: Layer = { id: Math.random().toString(36).substr(2,9), type: 'image', content: b64, x: 0.5, y: 0.5, fontSize: 100, color: '', fontFamily: '', bold: false, italic: false }; setLayers([...layers, n]); setActiveLayerId(n.id); } }} />
            <GalleryPickerModal isOpen={isPickerOpen} onClose={() => { setIsPickerOpen(false); setPickerTarget(null); }} onSelect={handleLibrarySelect} selectionMode={mode === 'frame' ? 'single' : 'multiple'} typeFilter="image" />
            <ConfirmationModal isOpen={isVaultConfirmOpen} onClose={() => setIsVaultConfirmOpen(false)} onConfirm={async () => { setIsProcessing(true); const canvas = await generateFinalCanvas(); if(canvas) { await addItemToGallery('image', [canvas.toDataURL(`image/${outputFormat}`)], ['Composer'], undefined, `composition_${Date.now()}`); showGlobalFeedback?.("Saved to library."); } setIsProcessing(false); setIsVaultConfirmOpen(false); }} title="SAVE TO LIBRARY" message="Save this composition to your local folders?" btnClassName="btn-primary" />
        </div>
    );
};

export default ComposerPage;
