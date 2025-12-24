import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { UploadIcon, CropIcon, LinkIcon, LinkOffIcon, PhotoIcon, RefreshIcon, DownloadIcon, CloseIcon } from './icons';
import { COMPOSER_PRESETS } from '../constants';

// --- TYPES ---
type ImageStatus = 'pending' | 'processing' | 'done' | 'error';
type CropData = { x: number; y: number; width: number; height: number; }; // in percentages

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
    format: 'jpeg' | 'png' | 'webp';
    quality: number;
    renamePrefix: string;
    renameSequentially: boolean;
}

// --- ASYNC IMAGE PROCESSING ---
const processImage = (item: ImageItem, settings: ProcessSettings): Promise<ImageItem> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !(window as any).Image || !(window as any).document?.createElement) {
            return reject(new Error("Browser environment not supported."));
        }
        const img = new (window as any).Image();
        
        img.onload = () => {
            try {
                const canvas = (window as any).document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error("Could not create canvas context."));

                // --- REVISED DIMENSION CALCULATION ---
                let targetWidth = settings.width ? Number(settings.width) : 0;
                let targetHeight = settings.height ? Number(settings.height) : 0;
                const imgAspect = img.naturalWidth / img.naturalHeight;
                
                // Case 1: Only one dimension is provided, calculate the other to maintain aspect ratio.
                if (targetWidth && !targetHeight) {
                    targetHeight = targetWidth / imgAspect;
                } else if (!targetWidth && targetHeight) {
                    targetWidth = targetHeight * imgAspect;
                } else if (!targetWidth && !targetHeight) {
                    // Case 2: No dimensions provided, use original.
                    targetWidth = item.originalWidth;
                    targetHeight = item.originalHeight;
                } else if (!settings.enableCropping && settings.lockAspectRatio && targetWidth && targetHeight) {
                    // Case 3: Resize without crop, with aspect lock on.
                    // Prioritize width and recalculate height to match aspect ratio.
                    // This prevents letterboxing by making the canvas match the image aspect.
                    targetHeight = targetWidth / imgAspect;
                }
                // Case 4 (implicit): Cropping is enabled, or aspect lock is off.
                // Use the user-provided targetWidth and targetHeight as is. The crop/contain logic will handle fitting.

                if (targetWidth <= 0 || targetHeight <= 0) {
                    return reject(new Error(`Invalid output dimensions: ${targetWidth}x${targetHeight}`));
                }

                canvas.width = Math.round(targetWidth);
                canvas.height = Math.round(targetHeight);
                
                if (canvas.width <= 0 || canvas.height <= 0 || canvas.width > 16384 || canvas.height > 16384) {
                    return reject(new Error(`Invalid output dimensions: ${canvas.width}x${canvas.height}`));
                }

                ctx.imageSmoothingQuality = 'high';
                
                if(settings.enableCropping) {
                    // --- CROP & FILL LOGIC ---
                    const sx = Math.round((item.crop.x / 100) * img.naturalWidth);
                    const sy = Math.round((item.crop.y / 100) * img.naturalHeight);
                    const sWidth = Math.round((item.crop.width / 100) * img.naturalWidth);
                    const sHeight = Math.round((item.crop.height / 100) * img.naturalHeight);
                    if (sWidth <= 0 || sHeight <= 0) return reject(new Error(`Invalid crop dimensions: ${sWidth}x${sHeight}`));
                    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                } else {
                    // --- CONTAIN LOGIC ---
                    // With the new targetWidth/targetHeight logic, this part now works for both letterboxing and direct resize.
                    // If canvas matches aspect, it will fill perfectly. If not, it will be contained with letterboxing.
                    const canvasAspect = canvas.width / canvas.height;
                    let dWidth = canvas.width;
                    let dHeight = canvas.height;
                    let dx = 0;
                    let dy = 0;

                    if (imgAspect > canvasAspect) { // image is wider than canvas
                        dHeight = canvas.width / imgAspect;
                        dy = (canvas.height - dHeight) / 2;
                    } else { // image is taller or same aspect
                        dWidth = canvas.height * imgAspect;
                        dx = (canvas.width - dWidth) / 2;
                    }
                    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, Math.round(dx), Math.round(dy), Math.round(dWidth), Math.round(dHeight));
                }
                
                const qualityArg = (settings.format === 'jpeg' || settings.format === 'webp') ? settings.quality : undefined;

                canvas.toBlob(
                    (blob: Blob | null) => {
                        if (!blob) return reject(new Error("Canvas toBlob failed. The image might be too large."));
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
                reject(e instanceof Error ? e : new Error("An unknown error occurred during image processing."));
            }
        };
        img.onerror = () => reject(new Error("Image failed to load. It might be corrupt or an unsupported format."));
        img.src = item.originalUrl;
    });
};


// --- UI SUB-COMPONENTS ---

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
        className="w-full h-full p-6 flex flex-col items-center justify-center"
        onDragEnter={() => setIsDragging(true)} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
      >
        <div 
          className={`w-full h-full rounded-2xl border-4 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20'}`}
          onClick={() => (fileInputRef.current as any)?.click()}
        >
            <input type="file" ref={fileInputRef} multiple accept="image/*" className="hidden" onChange={handleFileChange} />
            <UploadIcon className="w-24 h-24 text-base-content/30" />
            <h2 className="text-2xl font-bold mt-4">Drop Your Images Here</h2>
            <p className="text-base-content/70">or click to browse</p>
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
        <div className="card card-compact bg-base-200 shadow-lg">
            <figure ref={imageRef} className="relative aspect-square bg-base-300">
                <img src={item.originalUrl} alt={item.file.name} className="w-full h-full object-contain" />
                {settings.enableCropping && (
                    <div 
                        className="absolute pointer-events-auto cursor-move border-2 border-dashed border-primary"
                        style={{
                            boxShadow: `0 0 0 9999px oklch(var(--b1)/0.6)`,
                            left: `${item.crop.x}%`,
                            top: `${item.crop.y}%`,
                            width: `${item.crop.width}%`,
                            height: `${item.crop.height}%`
                        }}
                        onMouseDown={(e) => onCropMouseDown(e, item.id)}
                    ></div>
                )}
            </figure>
            <div className="card-body p-3 text-xs">
                <div className="flex justify-between items-start">
                    <div className="min-w-0">
                        <p className="font-semibold truncate" title={item.file.name}>{item.file.name}</p>
                        <p className="text-base-content/70">{item.originalWidth}x{item.originalHeight}</p>
                    </div>
                    <button onClick={onRemove} className="btn btn-xs btn-ghost btn-square text-error/70 hover:text-error"><CloseIcon className="w-4 h-4"/></button>
                </div>
                {item.status === 'error' && <p className="text-error truncate">{item.errorMessage}</p>}
                {item.status === 'done' && item.processed && <p className="text-success">{item.processed.width}x{item.processed.height} ({formatBytes(item.processed.size)})</p>}
            </div>
        </div>
    )
}

// --- MAIN COMPONENT ---
const ImageResizer: React.FC = () => {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // Settings
    const [settings, setSettings] = useState<ProcessSettings>({
        width: 1024, height: 1024, lockAspectRatio: true, enableCropping: true,
        format: 'jpeg', quality: 0.9, renamePrefix: '', renameSequentially: false,
    });
    
    // Dragging state for crop box
    const [dragState, setDragState] = useState<{ id: string; startMouseX: number; startMouseY: number; startCropX: number; startCropY: number; imageWidth: number; imageHeight: number } | null>(null);
    const imageRefs = useRef(new Map<string, HTMLDivElement>());

    // --- CROP CALCULATION LOGIC ---
    const calculateCrop = useCallback((image: ImageItem, targetWidth: number, targetHeight: number): ImageItem => {
        if (!targetWidth || !targetHeight) return { ...image };
    
        const targetAspect = targetWidth / targetHeight;
        const imgAspect = image.originalWidth / image.originalHeight;
        let newCrop: CropData = { x: 0, y: 0, width: 100, height: 100 };
    
        if (imgAspect > targetAspect) { // Image is wider than target
            newCrop.width = (targetAspect / imgAspect) * 100;
            newCrop.height = 100;
        } else { // Image is taller or same aspect
            newCrop.width = 100;
            newCrop.height = (imgAspect / targetAspect) * 100;
        }
        
        // Always center initially
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

    // --- Effects ---
    useEffect(() => {
        if (settings.enableCropping) {
            updateAllCrops();
        }
    }, [settings.width, settings.height, settings.enableCropping, updateAllCrops]);

    // Effect for handling crop box dragging
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

    // Cleanup object URLs on unmount
    useEffect(() => {
        const currentImages = images;
        return () => {
            currentImages.forEach(item => {
                URL.revokeObjectURL(item.originalUrl);
                if (item.processed) URL.revokeObjectURL(item.processed.url);
            });
        };
    }, []);

    // --- Handlers ---
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
        // Invalidate previous results when settings change
        setImages(imgs => imgs.map(i => ({...i, status: 'pending', processed: undefined})));
    };

    const handleDownload = async () => {
        if (images.length === 0) return;
        setIsDownloading(true);
    
        // Reset status of all images before starting
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
        <div className="p-6 flex flex-col gap-6 bg-base-200 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-grow min-h-0">
                {/* Left Column */}
                <aside className="lg:col-span-1 bg-base-100 rounded-xl shadow-xl flex flex-col">
                    <div className="p-4 border-b border-base-300"><h2 className="text-lg font-bold">Settings</h2></div>
                    <div className="flex-grow p-4 space-y-4 overflow-y-auto text-sm">
                        {/* Dimensions */}
                         <div className="form-control"><label className="label-text pb-1 font-semibold">Dimensions</label>
                            <div className="flex items-center gap-2">
                                <input type="number" value={settings.width} onChange={e => handleSettingsChange('width', (e.currentTarget as any).value ? parseInt((e.currentTarget as any).value) : '')} className="input input-sm input-bordered w-full" placeholder="Width" />
                                <button onClick={() => handleSettingsChange('lockAspectRatio', !settings.lockAspectRatio)} className="btn btn-sm btn-ghost btn-square">{settings.lockAspectRatio ? <LinkIcon/> : <LinkOffIcon/>}</button>
                                <input type="number" value={settings.height} onChange={e => handleSettingsChange('height', (e.currentTarget as any).value ? parseInt((e.currentTarget as any).value) : '')} className="input input-sm input-bordered w-full" placeholder="Height" />
                            </div>
                             <select 
                                className="select select-sm select-bordered w-full mt-2"
                                onChange={e => {
                                    const value = (e.currentTarget as any).value;
                                    if (value) {
                                        const [w, h] = value.split('x').map(Number);
                                        setSettings(s => ({...s, width: w, height: h}));
                                    }
                                }}
                                value={settings.width && settings.height ? `${settings.width}x${settings.height}` : ""}
                             >
                                <option value="" disabled>Or select a preset...</option>
                                {COMPOSER_PRESETS.map(cat => (
                                    <optgroup key={cat.category} label={cat.category}>
                                        {cat.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name} ({p.width}x{p.height})</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        {/* Cropping */}
                        <div className="form-control"><label className="cursor-pointer label p-0"><span className="label-text font-semibold flex items-center gap-2"><CropIcon/> Enable Crop</span><input type="checkbox" checked={settings.enableCropping} onChange={e => handleSettingsChange('enableCropping', (e.currentTarget as any).checked)} className="toggle toggle-sm toggle-primary" /></label></div>
                        {/* Output */}
                        <div className="form-control"><label className="label-text pb-1 font-semibold">Output</label>
                            <div className="flex items-center gap-2">
                                <select value={settings.format} onChange={e => handleSettingsChange('format', (e.currentTarget as any).value as 'jpeg' | 'png' | 'webp')} className="select select-sm select-bordered w-full">
                                    <option value="jpeg">JPEG</option>
                                    <option value="png">PNG</option>
                                    <option value="webp">WEBP</option>
                                </select>
                                {(settings.format === 'jpeg' || settings.format === 'webp') &&
                                    <input type="range" min={0.1} max={1} step={0.05} value={settings.quality} onChange={e => handleSettingsChange('quality', parseFloat((e.currentTarget as any).value))} className="range range-xs" title={`Quality: ${settings.quality}`} />
                                }
                            </div>
                            <input type="text" value={settings.renamePrefix} onChange={e => handleSettingsChange('renamePrefix', (e.currentTarget as any).value)} className="input input-sm input-bordered w-full mt-2" placeholder="File Prefix (optional)" />
                            <label className="cursor-pointer label p-0 mt-2"><span className="label-text">Add number sequence (e.g., prefix-001)</span><input type="checkbox" checked={settings.renameSequentially} onChange={e => handleSettingsChange('renameSequentially', (e.currentTarget as any).checked)} className="checkbox checkbox-sm" /></label>
                        </div>
                    </div>
                    <div className="p-4 border-t border-base-300 grid grid-cols-2 gap-2">
                        <button onClick={handleReset} disabled={isDownloading || images.length === 0} className="btn btn-sm btn-error btn-outline">
                            Reset
                        </button>
                        <button onClick={handleDownload} disabled={isDownloading || images.length === 0} className="btn btn-sm btn-primary">
                           {isDownloading ? <span className="loading loading-spinner loading-xs"></span> : <DownloadIcon className="w-4 h-4 mr-2"/>}
                           {isDownloading ? 'Processing...' : 'Download'}
                        </button>
                    </div>
                </aside>

                {/* Main Area */}
                <main className="lg:col-span-3 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0">
                    {images.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 p-4 overflow-y-auto">
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
                </main>
            </div>
        </div>
    );
};

export default ImageResizer;