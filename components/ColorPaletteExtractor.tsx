import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { analyzePaletteMood, generateColorName } from '../services/llmService';
import { UploadIcon, PhotoIcon, PaletteIcon, RefreshIcon, BookmarkIcon, CloseIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import type { Idea } from '../types';

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
        <div className="p-4 rounded-lg" style={{ backgroundColor: color.hex }}>
            <div className="p-3 rounded-md bg-black/40 backdrop-blur-sm text-white/90">
                <p className="font-bold text-lg">{color.name}</p>
                <div className="text-xs space-y-1 mt-2 font-mono">
                    <p className="flex justify-between items-center"><span>HEX</span> <span className="cursor-pointer p-1 rounded hover:bg-white/20" onClick={() => handleCopy('HEX', color.hex)}>{copied && copiedValue === 'HEX' ? 'Copied!' : color.hex}</span></p>
                    <p className="flex justify-between items-center"><span>RGB</span> <span className="cursor-pointer p-1 rounded hover:bg-white/20" onClick={() => handleCopy('RGB', `rgb(${Math.round(color.rgb[0])}, ${Math.round(color.rgb[1])}, ${Math.round(color.rgb[2])})`)}>{copied && copiedValue === 'RGB' ? 'Copied!' : `${Math.round(color.rgb[0])}, ${Math.round(color.rgb[1])}, ${Math.round(color.rgb[2])}`}</span></p>
                    <p className="flex justify-between items-center"><span>HSL</span> <span className="cursor-pointer p-1 rounded hover:bg-white/20" onClick={() => handleCopy('HSL', color.hsl)}>{copied && copiedValue === 'HSL' ? 'Copied!' : color.hsl}</span></p>
                </div>
            </div>
        </div>
    );
};

export const ColorPaletteExtractor: React.FC<ColorPaletteExtractorProps> = ({ onClipIdea }) => {
  const { settings } = useSettings();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<ColorInfo[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [numClusters, setNumClusters] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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
    if (pixels.length === 0 || maxClusters < 1) {
      return [];
    }

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

          if (maxRange > largestBucketDimensionRange) {
            largestBucketIndex = i;
            largestBucketSize = buckets[i].length;
            largestBucketDimensionRange = maxRange;
          }
        }
      }

      if (largestBucketIndex === -1) break;

      const bucketToSort = buckets[largestBucketIndex];
      const rangeR = Math.max(...bucketToSort.map(p => p[0])) - Math.min(...bucketToSort.map(p => p[0]));
      const rangeG = Math.max(...bucketToSort.map(p => p[1])) - Math.min(...bucketToSort.map(p => p[1]));
      const rangeB = Math.max(...bucketToSort.map(p => p[2])) - Math.min(...bucketToSort.map(p => p[2]));

      let sortDimension = 0; // R
      if (rangeG > rangeR && rangeG > rangeB) sortDimension = 1; // G
      if (rangeB > rangeR && rangeB > rangeG) sortDimension = 2; // B

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
  
  const extractPalette = useCallback(async (file: File, clusters: number) => {
    if (typeof window === 'undefined' || !(window as any).Image || !(window as any).document) return;

    setIsLoading(true);
    setError(null);
    setPalette([]);
    setMood(null);

    const img = new (window as any).Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
        if (!e.target || !e.target.result) return;
        img.src = e.target.result as string;
    };
    
    img.onload = async () => {
        try {
            const canvas = (window as any).document.createElement('canvas');
            const maxDimension = 200;
            const aspectRatio = img.width / img.height;
            if(aspectRatio > 1) {
                canvas.width = maxDimension;
                canvas.height = maxDimension / aspectRatio;
            } else {
                canvas.height = maxDimension;
                canvas.width = maxDimension * aspectRatio;
            }
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setError("Could not create canvas context.");
                setIsLoading(false);
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const pixels: RGBColor[] = [];
            for (let i = 0; i < imageData.length; i += 4) {
                pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
            }

            const centroids = medianCut(pixels, clusters);
            const hexColors = centroids.map(c => rgbToHex(c[0], c[1], c[2]));
            
            setPalette(hexColors.map((hex, i) => ({
                name: 'Analyzing...', hex, rgb: centroids[i], hsl: rgbToHsl(centroids[i][0], centroids[i][1], centroids[i][2]),
            })));
            
            const newMood = await analyzePaletteMood(hexColors, settings);
            setMood(newMood);

            const namedPalette = await Promise.all(
                centroids.map(async (rgb) => {
                    const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
                    const name = await generateColorName(hex, newMood, settings);
                    return { name, hex, rgb, hsl: rgbToHsl(rgb[0], rgb[1], rgb[2]) };
                })
            );
            
            setPalette(namedPalette);

        } catch (e: any) {
            setError(e.message || "Failed to process image.");
        } finally {
            setIsLoading(false);
        }
    };
    
    img.onerror = () => {
        setError("Could not load the image file. It might be corrupt.");
        setIsLoading(false);
    };

    reader.readAsDataURL(file);
  }, [settings]);

  const handleFileSelect = (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
        setImageFile(file);
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(URL.createObjectURL(file));
        extractPalette(file, numClusters);
        setError(null);
    } else if(file) {
        setError('Please select a valid image file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.currentTarget as any).files?.[0];
    handleFileSelect(file || null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect((e.dataTransfer as any)?.files?.[0] || null);
  };
  
  const handleRemoveImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      setImageFile(null);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
      setPalette([]);
      setMood(null);
      setError(null);
      setIsLoading(false);
      if (fileInputRef.current) {
          (fileInputRef.current as any).value = "";
      }
  };
  
  const handleClipPalette = () => {
      const prompt = `A color palette inspired by ${mood || 'a analyzed image'}: ${palette.map(c => `${c.name} (${c.hex})`).join(', ')}`;
      const idea: Idea = {
          id: `palette-${Date.now()}`,
          lens: 'Color',
          title: mood || `Color Palette from ${imageFile?.name || 'Image'}`,
          prompt: prompt,
          source: 'Color Palette Extractor'
      };
      onClipIdea(idea);
  };

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 bg-base-200 h-full">
        <div className="lg:col-span-1 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0">
            <div className="p-4 border-b border-base-300">
                <h2 className="text-lg font-bold">Image & Controls</h2>
            </div>
            <div className="flex-grow p-4 flex flex-col gap-4">
                 <div 
                    className={`relative flex-grow w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors group ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/50'}`}
                    style={{
                        backgroundImage: imagePreviewUrl ? `url(${imagePreviewUrl})` : 'none',
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    }}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => (fileInputRef.current as any)?.click()}
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                    {!imagePreviewUrl && (
                        <div className="text-center text-base-content/60 p-4 bg-base-100/50 rounded-lg backdrop-blur-sm">
                            <UploadIcon className="w-12 h-12 mx-auto"/>
                            <p className="mt-2 font-semibold">Drop an image here</p>
                            <p className="text-sm">or click to browse</p>
                        </div>
                    )}
                         {imagePreviewUrl && (
                        <button onClick={handleRemoveImage} className="btn btn-sm btn-circle btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100">
                            <CloseIcon className="w-4 h-4"/>
                        </button>
                    )}
                </div>
                <div className="flex-shrink-0 space-y-2">
                     <div className="form-control">
                         <label className="label py-1"><span className="label-text">Number of Colors: {numClusters}</span></label>
                         <input type="range" min="2" max="12" value={numClusters} onChange={(e) => setNumClusters(Number((e.currentTarget as any).value))} className="range range-xs range-primary" disabled={!imageFile || isLoading}/>
                    </div>
                    <button onClick={() => imageFile && extractPalette(imageFile, numClusters)} disabled={!imageFile || isLoading} className="btn btn-sm btn-secondary w-full">
                        <RefreshIcon className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}/>
                        Re-generate Palette
                    </button>
                </div>
            </div>
        </div>
        <main className="lg:col-span-3 bg-base-100 rounded-xl shadow-xl flex flex-col min-h-0">
            <div className="p-4 flex justify-between items-center border-b border-base-300">
                <h2 className="text-lg font-bold">Extracted Palette</h2>
            </div>
            <div className="flex-grow p-6 overflow-y-auto">
                {isLoading ? <LoadingSpinner/> :
                 error ? <div className="alert alert-error"><span>{error}</span></div> :
                 palette.length > 0 ? (
                    <div className="space-y-6">
                        {mood && (
                            <div>
                                <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">Overall Mood</h3>
                                <p className="text-2xl font-bold text-primary mt-1">{mood}</p>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="flex -space-x-4">
                                {palette.map(c => (
                                    <div key={c.hex} className="w-12 h-12 rounded-full border-2 border-base-100" style={{ backgroundColor: c.hex }} title={`${c.name} (${c.hex})`}></div>
                                ))}
                            </div>
                            <button onClick={handleClipPalette} className="btn btn-sm btn-ghost">
                                <BookmarkIcon className="w-4 h-4 mr-2"/>
                                Clip Palette Idea
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {palette.map(color => (
                                <ColorCard key={color.hex} color={color} />
                            ))}
                        </div>
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-base-content/60">
                        <PaletteIcon className="w-16 h-16" />
                        <p className="mt-4">Your extracted color palette will appear here.</p>
                    </div>
                 )}
            </div>
        </main>
    </div>
  );
};

export default ColorPaletteExtractor;