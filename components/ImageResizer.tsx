import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { UploadIcon, CropIcon, LinkIcon, LinkOffIcon } from './icons';
import { COMPOSER_PRESETS } from '../constants';

type ImageStatus = 'pending' | 'processing' | 'done' | 'error';
type CropData = { x: number; y: number; width: number; height: number; };

interface ImageItem {
    id: string;
    file: File;
    originalUrl: string;
    originalWidth: number;
    originalHeight: number;
    crop: CropData;
    status: ImageStatus;
    errorMessage?: string;
    processed?: {
        url: string;
        blob: Blob;
        width: number;
        height: number;
        size: number;
    }
}

interface ProcessSettings {
    width: number | '';
    height: number | '';
    lockAspectRatio: boolean;
    enableCropping: boolean;
    preserveOriginal: boolean;
    format: 'jpeg' | 'png' | 'webp';
    quality: number;
    renamePrefix: string;
    renameSequentially: boolean;
}

const processImage = (item: ImageItem, settings: ProcessSettings): Promise<ImageItem> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !(window as any).Image || !(window as any).document?.createElement) {
            return reject(new Error("Environment not supported."));
        }
        const img = new (window as any).Image();

        img.onload = () => {
            try {
                const canvas = (window as any).document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error("Canvas error."));

                let targetWidth = settings.width ? Number(settings.width) : 0;
                let targetHeight = settings.height ? Number(settings.height) : 0;
                const imgAspect = img.naturalWidth / img.naturalHeight;

                if (settings.preserveOriginal) {
                    targetWidth = item.originalWidth;
                    targetHeight = item.originalHeight;
                } else if (targetWidth && !targetHeight) {
                    targetHeight = targetWidth / imgAspect;
                } else if (!targetWidth && targetHeight) {
                    targetWidth = targetHeight * imgAspect;
                } else if (!targetWidth && !targetHeight) {
                    targetWidth = item.originalWidth;
                    targetHeight = item.originalHeight;
                } else if (!settings.enableCropping && settings.lockAspectRatio && targetWidth && targetHeight) {
                    targetHeight = targetWidth / imgAspect;
                }

                if (settings.preserveOriginal) {
                    // Force full image draw if preserving original
                    canvas.width = item.originalWidth;
                    canvas.height = item.originalHeight;
                    ctx.drawImage(img, 0, 0);
                } else {
                    if (targetWidth <= 0 || targetHeight <= 0) {
                        return reject(new Error(`Invalid dimensions: ${targetWidth}x${targetHeight}`));
                    }

                    canvas.width = Math.round(targetWidth);
                    canvas.height = Math.round(targetHeight);

                    ctx.imageSmoothingQuality = 'high';

                    if (settings.enableCropping) {
                        const sx = Math.round((item.crop.x / 100) * img.naturalWidth);
                        const sy = Math.round((item.crop.y / 100) * img.naturalHeight);
                        const sWidth = Math.round((item.crop.width / 100) * img.naturalWidth);
                        const sHeight = Math.round((item.crop.height / 100) * img.naturalHeight);
                        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                    } else {
                        const canvasAspect = canvas.width / canvas.height;
                        let dWidth = canvas.width;
                        let dHeight = canvas.height;
                        let dx = 0;
                        let dy = 0;

                        if (imgAspect > canvasAspect) {
                            dHeight = canvas.width / imgAspect;
                            dy = (canvas.height - dHeight) / 2;
                        } else {
                            dWidth = canvas.height * imgAspect;
                            dx = (canvas.width - dWidth) / 2;
                        }
                        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, Math.round(dx), Math.round(dy), Math.round(dWidth), Math.round(dHeight));
                    }
                }

                const qualityArg = (settings.format === 'jpeg' || settings.format === 'webp') ? settings.quality : undefined;

                canvas.toBlob(
                    (blob: Blob | null) => {
                        if (!blob) return reject(new Error("Export failed."));
                        const processedData = {
                            url: URL.createObjectURL(blob),
                            blob,
                            width: canvas.width,
                            height: canvas.height,
                            size: blob.size,
                        };
                        resolve({ ...item, status: 'done', processed: processedData });
                    },
                    `image/${settings.format}`,
                    qualityArg
                );
            } catch (e) {
                reject(e instanceof Error ? e : new Error("An error occurred."));
            }
        };
        img.onerror = () => reject(new Error("Image error."));
        img.src = item.originalUrl;
    });
};

const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
};

const DropZone: React.FC<{ onFilesAdded: (files: File[]) => void }> = ({ onFilesAdded }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => onFilesAdded(Array.from((e.currentTarget as any).files || []));
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); onFilesAdded(Array.from((e.dataTransfer as any).files || [])); };
    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center bg-transparent"
            onDragEnter={() => setIsDragging(true)} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
        >
            <div
                className={`w-full h-full rounded-none flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'bg-primary/10' : 'hover:bg-base-200/20'}`}
                onClick={() => (fileInputRef.current as any)?.click()}
            >
                <input type="file" ref={fileInputRef} multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                <UploadIcon className="w-16 h-16 text-base-content/20 mb-6" />
                <h2 className="text-2xl font-black uppercase tracking-tighter">UPLOAD IMAGES</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-base-content/40 mt-2 px-4 text-center">Drop images or click to select files</p>
            </div>
        </div>
    );
};

const ImageCard: React.FC<{
    item: ImageItem,
    settings: ProcessSettings,
    onRemove: () => void,
    onCropMouseDown: (e: React.MouseEvent, id: string) => void,
    imageRef: (el: HTMLDivElement | null) => void,
}> = ({ item, settings, onRemove, onCropMouseDown, imageRef }) => {
    return (
        <div className="flex flex-col bg-transparent group relative">
            <div className="relative aspect-square w-full">
                <figure ref={imageRef} className="absolute inset-0 bg-transparent overflow-hidden border border-base-content/10">
                    <img src={item.originalUrl} alt={item.file.name} className="w-full h-full object-contain" />
                    {settings.enableCropping && (
                        <div
                            className="absolute pointer-events-auto cursor-move border-2 border-dashed border-primary"
                            style={{
                                boxShadow: `0 0 0 9999px oklch(var(--b1)/0.7)`,
                                left: `${item.crop.x}%`,
                                top: `${item.crop.y}%`,
                                width: `${item.crop.width}%`,
                                height: `${item.crop.height}%`
                            }}
                            onMouseDown={(e) => onCropMouseDown(e, item.id)}
                        ></div>
                    )}
                </figure>
                <button
                    onClick={onRemove}
                    className="absolute top-2 right-2 z-[999] bg-error text-error-content hover:bg-error/80 transition-all shadow-lg pointer-events-auto flex items-center justify-center w-6 h-6 rounded-full opacity-0 group-hover:opacity-100"
                    title="Remove Image"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-4 space-y-1">
                <p className="text-xs lg:text-sm font-black uppercase tracking-widest text-base-content truncate" title={item.file.name}>{item.file.name}</p>
                <p className="text-[10px] lg:text-xs font-mono text-base-content/40">{item.originalWidth}×{item.originalHeight}</p>
                {item.status === 'error' && <p className="text-[10px] lg:text-xs text-error font-black uppercase">{item.errorMessage}</p>}
                {item.status === 'done' && item.processed && <p className="text-[10px] lg:text-xs text-success font-black uppercase">{item.processed.width}×{item.processed.height} • {formatBytes(item.processed.size)}</p>}
            </div>
        </div>
    )
}

const ImageResizer: React.FC = () => {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);

    const [settings, setSettings] = useState<ProcessSettings>({
        width: 1024, height: 1024, lockAspectRatio: true, enableCropping: true,
        preserveOriginal: false,
        format: 'jpeg', quality: 0.9, renamePrefix: '', renameSequentially: false,
    });

    const [dragState, setDragState] = useState<{ id: string; startMouseX: number; startMouseY: number; startCropX: number; startCropY: number; imageWidth: number; imageHeight: number } | null>(null);
    const imageRefs = useRef(new Map<string, HTMLDivElement>());

    const calculateCrop = useCallback((image: ImageItem, targetWidth: number, targetHeight: number): ImageItem => {
        if (!targetWidth || !targetHeight) return { ...image };

        const targetAspect = targetWidth / targetHeight;
        const imgAspect = image.originalWidth / image.originalHeight;
        let newCrop: CropData = { x: 0, y: 0, width: 100, height: 100 };

        if (imgAspect > targetAspect) {
            newCrop.width = (targetAspect / imgAspect) * 100;
            newCrop.height = 100;
        } else {
            newCrop.width = 100;
            newCrop.height = (imgAspect / targetAspect) * 100;
        }

        newCrop.x = (100 - newCrop.width) / 2;
        newCrop.y = (100 - newCrop.height) / 2;

        return { ...image, crop: newCrop };

    }, []);

    const updateAllCrops = useCallback(() => {
        const targetW = settings.width ? Number(settings.width) : null;
        const targetH = settings.height ? Number(settings.height) : null;
        if (!targetW || !targetH) return;

        setImages(prev => prev.map(item => calculateCrop(item, targetW, targetH)));
    }, [settings.width, settings.height, calculateCrop]);

    useEffect(() => {
        if (settings.enableCropping) {
            updateAllCrops();
        }
    }, [settings.width, settings.height, settings.enableCropping, updateAllCrops]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragState) return;

            const { id, startMouseX, startMouseY, startCropX, startCropY, imageWidth, imageHeight } = dragState;
            const dx = (e as any).clientX - startMouseX;
            const dy = (e as any).clientY - startMouseY;
            const dxPercent = (dx / imageWidth) * 100;
            const dyPercent = (dy / imageHeight) * 100;

            setImages(prev => prev.map(i => {
                if (i.id !== id) return i;
                const newX = Math.max(0, Math.min(startCropX + dxPercent, 100 - i.crop.width));
                const newY = Math.max(0, Math.min(startCropY + dyPercent, 100 - i.crop.height));
                return { ...i, crop: { ...i.crop, x: newX, y: newY } };
            }));
        };

        const handleMouseUp = () => {
            setDragState(null);
        };

        if (dragState) {
            (window as any).addEventListener('mousemove', handleMouseMove);
            (window as any).addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            (window as any).removeEventListener('mousemove', handleMouseMove);
            (window as any).removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState]);

    useEffect(() => {
        const currentImages = images;
        return () => {
            currentImages.forEach(item => {
                URL.revokeObjectURL(item.originalUrl);
                if (item.processed) URL.revokeObjectURL(item.processed.url);
            });
        };
    }, []);

    const handleAddFiles = useCallback((files: File[]) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const promises = imageFiles.map(file => new Promise<ImageItem | null>(resolve => {
            const originalUrl = URL.createObjectURL(file);
            const img = new (window as any).Image();
            img.onload = () => resolve({
                file, originalUrl, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight,
                id: `${file.name}-${file.lastModified}-${Math.random()}`,
                crop: { x: 0, y: 0, width: 100, height: 100 }, status: 'pending'
            });
            img.onerror = () => { URL.revokeObjectURL(originalUrl); resolve(null); };
            img.src = originalUrl;
        }));

        Promise.all(promises).then(newItems => {
            const validItems = newItems.filter((i): i is ImageItem => i !== null);
            const targetW = settings.width ? Number(settings.width) : null;
            const targetH = settings.height ? Number(settings.height) : null;

            const processedItems = validItems.map(item => {
                if (settings.enableCropping && targetW && targetH) {
                    return calculateCrop(item, targetW, targetH);
                }
                return item;
            });

            setImages(prev => [...prev, ...processedItems]);
        });
    }, [settings.enableCropping, settings.width, settings.height, calculateCrop]);

    const handleSettingsChange = <K extends keyof ProcessSettings>(key: K, value: ProcessSettings[K]) => {
        setSettings(s => ({ ...s, [key]: value }));
        setImages(imgs => imgs.map(i => ({ ...i, status: 'pending', processed: undefined })));
    };

    const handleDownload = async () => {
        if (images.length === 0) return;
        setIsDownloading(true);
        setImages(prev => prev.map(i => ({ ...i, status: 'processing', errorMessage: undefined })));

        const processingPromises = images.map(item =>
            processImage(item, settings)
                .catch(err => ({ ...item, status: 'error', errorMessage: err.message }))
        );

        const results = await Promise.all(processingPromises);
        setImages(results as ImageItem[]);

        const successfulResults = results.filter((r): r is ImageItem & { processed: NonNullable<ImageItem['processed']> } => !!(r.status === 'done' && r.processed));

        if (successfulResults.length > 0) {
            const zip = new JSZip();
            successfulResults.forEach((img, index) => {
                const extension = settings.format;
                const originalName = img.file.name.substring(0, img.file.name.lastIndexOf('.'));
                let newName = settings.renamePrefix ? `${settings.renamePrefix}${originalName}` : originalName;
                if (settings.renameSequentially) {
                    newName = `${settings.renamePrefix}${String(index + 1).padStart(3, '0')}`;
                }
                zip.file(`${newName}.${extension}`, img.processed.blob);
            });

            const content = await zip.generateAsync({ type: "blob" });
            if (typeof window !== 'undefined') {
                const link = (window as any).document.createElement("a");
                link.href = URL.createObjectURL(content);
                link.download = `resized_images_${Date.now()}.zip`;
                link.click();
                URL.revokeObjectURL(link.href);
            }
        }

        setIsDownloading(false);
    };

    const handleRemoveImage = (id: string) => {
        setImages(imgs => imgs.filter(i => {
            if (i.id === id) {
                URL.revokeObjectURL(i.originalUrl);
                if (i.processed) URL.revokeObjectURL(i.processed.url);
                return false;
            }
            return true;
        }));
    };

    const handleReset = () => {
        images.forEach(i => {
            URL.revokeObjectURL(i.originalUrl);
            if (i.processed) URL.revokeObjectURL(i.processed.url);
        });
        setImages([]);
    };

    const handleCropMouseDown = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const imageRef = imageRefs.current.get(id);
        const item = images.find(i => i.id === id);
        if (!imageRef) return;
        const rect = (imageRef as any).getBoundingClientRect();
        if (!item) return;


        setDragState({
            id,
            startMouseX: (e as any).clientX,
            startMouseY: (e as any).clientY,
            startCropX: item.crop.x,
            startCropY: item.crop.y,
            imageWidth: rect.width,
            imageHeight: rect.height
        });
    };

    return (
        <div className="h-full bg-transparent flex flex-col overflow-hidden p-0">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden gap-4">
                <aside className="w-full lg:w-96 flex-shrink-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                        <header className="p-6 bg-base-100/10 backdrop-blur-md">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Resize Settings</h3>
                        </header>
                        <div className="flex-grow p-6 space-y-8 overflow-y-auto bg-transparent">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Target Resolution</label>
                                    <label className="cursor-pointer label p-0 gap-2">
                                        <span className="text-[9px] font-black uppercase text-base-content/40 tracking-widest">Original</span>
                                        <input type="checkbox" checked={settings.preserveOriginal} onChange={e => handleSettingsChange('preserveOriginal', (e.currentTarget as any).checked)} className="checkbox checkbox-xs checkbox-primary rounded-none" />
                                    </label>
                                </div>
                                <div className={`flex items-center gap-2 transition-opacity ${settings.preserveOriginal ? 'opacity-30 pointer-events-none' : ''}`}>
                                    <input type="number" disabled={settings.preserveOriginal} value={settings.width} onChange={e => handleSettingsChange('width', (e.currentTarget as any).value ? parseInt((e.currentTarget as any).value) : '')} className="form-input w-full font-mono text-xs" placeholder="W" />
                                    <button disabled={settings.preserveOriginal} onClick={() => handleSettingsChange('lockAspectRatio', !settings.lockAspectRatio)} className={`form-btn h-8 w-8 ${settings.lockAspectRatio ? 'text-primary' : 'opacity-20'}`}>{settings.lockAspectRatio ? <LinkIcon className="w-4 h-4" /> : <LinkOffIcon className="w-4 h-4" />}</button>
                                    <input type="number" disabled={settings.preserveOriginal} value={settings.height} onChange={e => handleSettingsChange('height', (e.currentTarget as any).value ? parseInt((e.currentTarget as any).value) : '')} className="form-input w-full font-mono text-xs" placeholder="H" />
                                </div>
                                <select
                                    disabled={settings.preserveOriginal}
                                    className={`form-select w-full mt-2 transition-opacity ${settings.preserveOriginal ? 'opacity-30 pointer-events-none' : ''}`}
                                    onChange={e => {
                                        const value = (e.currentTarget as any).value;
                                        if (value) {
                                            const [w, h] = value.split('x').map(Number);
                                            setSettings(s => ({ ...s, width: w, height: h }));
                                        }
                                    }}
                                    value={settings.width && settings.height ? `${settings.width}x${settings.height}` : ""}
                                >
                                    <option value="" disabled>Standard Presets</option>
                                    {COMPOSER_PRESETS.map(cat => (
                                        <optgroup key={cat.category} label={cat.category}>
                                            {cat.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Cropping</label>
                                <div className={`form-control transition-opacity ${settings.preserveOriginal ? 'opacity-30 pointer-events-none' : ''}`}>
                                    <label className="cursor-pointer label p-0 gap-4">
                                        <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest flex items-center gap-2"><CropIcon className="w-3.5 h-3.5" /> Enable Smart Crop</span>
                                        <input type="checkbox" disabled={settings.preserveOriginal} checked={settings.enableCropping && !settings.preserveOriginal} onChange={e => handleSettingsChange('enableCropping', (e.currentTarget as any).checked)} className="toggle toggle-xs toggle-primary" />
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Output Files</label>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <select value={settings.format} onChange={e => handleSettingsChange('format', (e.currentTarget as any).value as 'jpeg' | 'png' | 'webp')} className="form-select w-full">
                                            <option value="jpeg">JPEG</option>
                                            <option value="png">PNG</option>
                                            <option value="webp">WEBP</option>
                                        </select>
                                        {(settings.format === 'jpeg' || settings.format === 'webp') &&
                                            <input type="range" min={0.1} max={1} step={0.05} value={settings.quality} onChange={e => handleSettingsChange('quality', parseFloat((e.currentTarget as any).value))} className="range range-xs range-primary w-24" />
                                        }
                                    </div>
                                    <input type="text" value={settings.renamePrefix} onChange={e => handleSettingsChange('renamePrefix', (e.currentTarget as any).value)} className="form-input w-full font-bold text-xs" placeholder="FILE_PREFIX_" />
                                    <label className="cursor-pointer label p-0 gap-4">
                                        <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Sequential Naming</span>
                                        <input type="checkbox" checked={settings.renameSequentially} onChange={e => handleSettingsChange('renameSequentially', (e.currentTarget as any).checked)} className="checkbox checkbox-xs checkbox-primary rounded-none" />
                                    </label>
                                </div>
                            </div>
                        </div>
                        <footer className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5">
                            <button
                                onClick={handleReset}
                                disabled={isDownloading || images.length === 0}
                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake text-error/40 hover:text-error font-display"
                            >
                                <span /><span /><span /><span />
                                CLEAR ALL
                            </button>
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading || images.length === 0}
                                className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display"
                            >
                                <span /><span /><span /><span />
                                {isDownloading ? '...' : 'ZIP DOWNLOAD'}
                            </button>
                        </footer>
                    </div>
                    {/* Manual Corner Accents */}
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </aside>

                <main className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10 ml-1">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                        <div className="flex-grow p-4 lg:p-6 bg-transparent relative flex flex-col overflow-hidden">
                            {images.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6 bg-transparent overflow-y-auto w-full">
                                    {images.map(img => (
                                        <ImageCard
                                            key={img.id}
                                            item={img}
                                            settings={settings}
                                            onRemove={() => handleRemoveImage(img.id)}
                                            onCropMouseDown={handleCropMouseDown}
                                            imageRef={(el) => {
                                                if (el) imageRefs.current.set(img.id, el);
                                                else imageRefs.current.delete(img.id);
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <DropZone onFilesAdded={handleAddFiles} />
                            )}
                        </div>
                    </div>
                    {/* Manual Corner Accents */}
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </main>
            </div>
        </div>
    );
};

export default ImageResizer;