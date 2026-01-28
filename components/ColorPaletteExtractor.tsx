import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { analyzePaletteMood, generateColorName } from '../services/llmService';
import { UploadIcon, PhotoIcon, PaletteIcon, RefreshIcon, BookmarkIcon, CloseIcon, FolderClosedIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import type { Idea, GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';
import GalleryPickerModal from './GalleryPickerModal';

type RGBColor = [number, number, number];

interface ColorInfo {
  name: string;
  hex: string;
  rgb: RGBColor;
  hsl: string;
}

interface ColorPaletteExtractorProps {
  onClipIdea: (idea: Idea) => void;
}

const ColorCard: React.FC<{ color: ColorInfo }> = ({ color }) => {
    const [copied, setCopied] = useState(false);
    const [copiedValue, setCopiedValue] = useState('');
    const handleCopy = (text: string, value: string) => {
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(value).then(() => {
                setCopiedValue(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };
    return (
        <div className="border border-base-300 bg-base-100 group">
            <div className="h-32 w-full" style={{ backgroundColor: color.hex }}></div>
            <div className="p-4">
                <p className="font-black tracking-tighter text-xl text-base-content mb-3">{color.name}</p>
                <div className="text-[10px] space-y-2 font-mono font-bold uppercase tracking-widest text-base-content/40">
                    <p className="flex justify-between items-center border-b border-base-300/30 pb-1"><span>HEX</span> <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleCopy('HEX', color.hex)}>{copied && copiedValue === 'HEX' ? 'OK' : color.hex}</span></p>
                    <p className="flex justify-between items-center border-b border-base-300/30 pb-1"><span>RGB</span> <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleCopy('RGB', `${Math.round(color.rgb[0])},${Math.round(color.rgb[1])},${Math.round(color.rgb[2])}`)}>{copied && copiedValue === 'RGB' ? 'OK' : `${Math.round(color.rgb[0])}, ${Math.round(color.rgb[1])}, ${Math.round(color.rgb[2])}`}</span></p>
                    <p className="flex justify-between items-center"><span>HSL</span> <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleCopy('HSL', color.hsl)}>{copied && copiedValue === 'HSL' ? 'OK' : color.hsl}</span></p>
                </div>
            </div>
        </div>
    );
};

export const ColorPaletteExtractor: React.FC<ColorPaletteExtractorProps> = ({ onClipIdea }) => {
  const { settings } = useSettings();
  const [imageFile, setImageFile] = useState<File | string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<ColorInfo[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [numClusters, setNumClusters] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        (window as any).URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const rgbToHex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
  const rgbToHsl = (r: number, g: number, b: number): string => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    
    return `hsl(${h}, ${s}%, ${l}%)`;
  };

  const medianCut = (pixels: RGBColor[], maxClusters: number): RGBColor[] => {
    if (pixels.length === 0 || maxClusters < 1) return [];
    let buckets: RGBColor[][] = [pixels];
    while (buckets.length < maxClusters) {
      let largestBucketIndex = -1;
      let largestBucketSize = -1;
      let largestBucketDimensionRange = -1;
      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].length > largestBucketSize) {
          const rangeR = Math.max(...buckets[i].map(p => p[0])) - Math.min(...buckets[i].map(p => p[0]));
          const rangeG = Math.max(...buckets[i].map(p => p[1])) - Math.min(...buckets[i].map(p => p[1]));
          const rangeB = Math.max(...buckets[i].map(p => p[2])) - Math.min(...buckets[i].map(p => p[2]));
          const maxRange = Math.max(rangeR, rangeG, rangeB);
          if (maxRange > largestBucketDimensionRange) { largestBucketIndex = i; largestBucketSize = buckets[i].length; largestBucketDimensionRange = maxRange; }
        }
      }
      if (largestBucketIndex === -1) break;
      const bucketToSort = buckets[largestBucketIndex];
      const rangeR = Math.max(...bucketToSort.map(p => p[0])) - Math.min(...bucketToSort.map(p => p[0]));
      const rangeG = Math.max(...bucketToSort.map(p => p[1])) - Math.min(...bucketToSort.map(p => p[1]));
      const rangeB = Math.max(...bucketToSort.map(p => p[2])) - Math.min(...bucketToSort.map(p => p[2]));
      let sortDimension = 0;
      if (rangeG > rangeR && rangeG > rangeB) sortDimension = 1;
      if (rangeB > rangeR && rangeB > rangeG) sortDimension = 2;
      bucketToSort.sort((a, b) => a[sortDimension] - b[sortDimension]);
      const mid = Math.floor(bucketToSort.length / 2);
      buckets.splice(largestBucketIndex, 1, bucketToSort.slice(0, mid), bucketToSort.slice(mid));
    }
    return buckets.map(bucket => {
      const avgR = bucket.reduce((sum, p) => sum + p[0], 0) / bucket.length;
      const avgG = bucket.reduce((sum, p) => sum + p[1], 0) / bucket.length;
      const avgB = bucket.reduce((sum, p) => sum + p[2], 0) / bucket.length;
      return [avgR, avgG, avgB];
    });
  };
  
  const extractPalette = useCallback(async (sourceUrl: string, clusters: number) => {
    if (typeof window === 'undefined' || !(window as any).Image || !(window as any).document) return;
    setIsLoading(true);
    setError(null);
    setPalette([]);
    setMood(null);
    
    const img = new (window as any).Image();
    img.crossOrigin = "Anonymous";
    
    img.onload = async () => {
        try {
            const canvas = (window as any).document.createElement('canvas');
            const maxDimension = 200;
            const aspectRatio = img.width / img.height;
            if(aspectRatio > 1) { canvas.width = maxDimension; canvas.height = maxDimension / aspectRatio; }
            else { canvas.height = maxDimension; canvas.width = maxDimension * aspectRatio; }
            const ctx = canvas.getContext('2d');
            if (!ctx) { setError("Could not create canvas context."); setIsLoading(false); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const pixels: RGBColor[] = [];
            for (let i = 0; i < imageData.length; i += 4) { pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]]); }
            const centroids = medianCut(pixels, clusters);
            const hexColors = centroids.map(c => rgbToHex(c[0], c[1], c[2]));
            setPalette(hexColors.map((hex, i) => ({ name: 'Analysing Spectrum...', hex, rgb: centroids[i], hsl: rgbToHsl(centroids[i][0], centroids[i][1], centroids[i][2]), })));
            const newMood = await analyzePaletteMood(hexColors, settings);
            setMood(newMood);
            const namedPalette = await Promise.all(centroids.map(async (rgb) => {
                const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
                const name = await generateColorName(hex, newMood, settings);
                return { name, hex, rgb, hsl: rgbToHsl(rgb[0], rgb[1], rgb[2]) };
            }));
            setPalette(namedPalette);
        } catch (e: any) { setError(e.message || "Spectrum failure."); } finally { setIsLoading(false); }
    };
    img.onerror = () => { setError("Relic corrupt."); setIsLoading(false); };
    img.src = sourceUrl;
  }, [settings]);

  const handleFileSelect = (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
        setImageFile(file);
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        const url = URL.createObjectURL(file);
        setImagePreviewUrl(url);
        extractPalette(url, numClusters);
        setError(null);
    } else if(file) setError('Invalid relic type.');
  };

  const handleLibrarySelect = async (items: GalleryItem[]) => {
      if (!items.length) return;
      const gItem = items[0];
      const blob = await fileSystemManager.getFileAsBlob(gItem.urls[0]);
      if (!blob) return;
      
      setImageFile(gItem.title);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      const url = URL.createObjectURL(blob);
      setImagePreviewUrl(url);
      extractPalette(url, numClusters);
      setError(null);
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
      e.stopPropagation(); setImageFile(null);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null); setPalette([]); setMood(null); setError(null); setIsLoading(false);
      if (fileInputRef.current) (fileInputRef.current as any).value = "";
  };
  
  const handleClipPalette = () => {
      const prompt = `A color palette inspired by ${mood || 'a analyzed image'}: ${palette.map(c => `${c.name} (${c.hex})`).join(', ')}`;
      const titleStr = typeof imageFile === 'string' ? imageFile : (imageFile as File)?.name || 'Artifact';
      const idea: Idea = { id: `palette-${Date.now()}`, lens: 'Color', title: mood || `Spectrum: ${titleStr}`, prompt: prompt, source: 'Palette Extractor' };
      onClipIdea(idea);
  };

  return (
    <div className="h-full bg-base-100 flex flex-col overflow-hidden">
        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
            <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 flex flex-col border-r border-base-300 overflow-hidden">
                <header className="p-6 border-b border-base-300 bg-base-200/10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Chromic Source</h3>
                </header>
                <div className="flex-grow p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                     <div 
                        className={`relative flex-grow min-h-[200px] border-2 border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-all gap-4 group ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-base-200/10'}`}
                        style={{ backgroundImage: imagePreviewUrl ? `url(${imagePreviewUrl})` : 'none', backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect((e.dataTransfer as any)?.files?.[0] || null); }}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                    >
                        <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect((e.currentTarget as any).files?.[0] || null)} className="hidden" accept="image/*" />
                        {!imagePreviewUrl && (
                            <>
                                <div className="text-center p-6 opacity-20">
                                    <UploadIcon className="w-10 h-10 mx-auto mb-2"/>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Load Source</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); (fileInputRef.current as any).click(); }} className="btn btn-xs btn-ghost border border-base-300 rounded-none font-black text-[8px] tracking-widest uppercase">UPLOAD</button>
                                    <button onClick={(e) => { e.stopPropagation(); setIsPickerOpen(true); }} className="btn btn-xs btn-primary rounded-none font-black text-[8px] tracking-widest uppercase">LIBRARY</button>
                                </div>
                            </>
                        )}
                        {imagePreviewUrl && (
                            <button onClick={handleRemoveImage} className="btn btn-xs btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 shadow-xl transition-all">✕</button>
                        )}
                    </div>
                    <div className="space-y-4">
                         <div className="space-y-4">
                             <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-base-content/30">Nodes</span><span className="text-[10px] font-mono font-bold text-primary">{numClusters}</span></div>
                             <input type="range" min="2" max="12" value={numClusters} onChange={(e) => setNumClusters(Number((e.currentTarget as any).value))} className="range range-xs range-primary" disabled={!imageFile || isLoading}/>
                        </div>
                        <button onClick={() => imagePreviewUrl && extractPalette(imagePreviewUrl, numClusters)} disabled={!imageFile || isLoading} className="btn btn-sm btn-secondary w-full rounded-none font-black text-[9px] tracking-widest">
                            {isLoading ? 'ANALYZING...' : 'RE-SCAN SPECTRUM'}
                        </button>
                    </div>
                </div>
            </aside>

            <main className="flex-grow bg-base-100 overflow-y-auto overflow-x-hidden scroll-smooth custom-scrollbar flex flex-col">
                <section className="p-10 border-b border-base-300 bg-base-200/20">
                    <div className="max-w-screen-2xl mx-auto flex flex-col gap-1">
                        <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-6">
                            <h1 className="text-2xl lg:text-3xl font-black tracking-tighter text-base-content leading-none flex items-center uppercase">Palette Extractor<span className="text-primary">.</span></h1>
                        </div>
                        <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] w-full">Deconstruct visual artifacts into precise chromatic tokens and atmospheric mood data.</p>
                    </div>
                </section>

                <div className="flex-shrink-0 bg-base-100 px-6 py-4 border-b border-base-300 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md bg-base-100/80">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40">Extraction Output</h2>
                    {palette.length > 0 && (
                        <button onClick={handleClipPalette} className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest uppercase">
                            <BookmarkIcon className="w-3.5 h-3.5 mr-2 opacity-40"/> CLIP TO ARCHIVE
                        </button>
                    )}
                </div>

                <div className="flex-grow p-8 lg:p-12 bg-base-200/5">
                    {isLoading ? <div className="py-24"><LoadingSpinner/></div> :
                     error ? <div className="alert alert-error rounded-none border-2"><span>{error}</span></div> :
                     palette.length > 0 ? (
                        <div className="space-y-12 animate-fade-in">
                            {mood && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Identified Mood</span>
                                    <p className="text-5xl font-black tracking-tighter text-base-content uppercase leading-none">{mood}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-px bg-base-300 border border-base-300">
                                {palette.map(color => (
                                    <ColorCard key={color.hex} color={color} />
                                ))}
                            </div>
                        </div>
                     ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-10 p-12">
                            <PaletteIcon className="w-24 h-24 mb-6" />
                            <p className="text-xl font-black uppercase tracking-widest">Awaiting Extraction Sequence</p>
                        </div>
                     )}
                </div>
            </main>
        </div>

        <GalleryPickerModal 
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            onSelect={handleLibrarySelect}
            selectionMode="single"
            typeFilter="image"
            title="Select image for color extraction"
        />
    </div>
  );
};

export default ColorPaletteExtractor;