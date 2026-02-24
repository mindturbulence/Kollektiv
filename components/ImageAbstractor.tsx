import React, { useState, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { abstractImage } from '../services/llmService';
import type { AppError, EnhancementResult } from '../types';
import { PROMPT_DETAIL_LEVELS } from '../constants';
import { PhotoIcon, CloseIcon, SparklesIcon, FilmIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { SuggestionItem } from './SuggestionItem';
import { fileToBase64 } from '../utils/fileUtils';

interface ImageAbstractorProps {
  onSaveSuggestion: (suggestionText: string) => void;
  header: React.ReactNode;
  onRefine: (text: string) => void;
  onClip: (text: string) => void;
}

export const ImageAbstractor: React.FC<ImageAbstractorProps> = ({ onSaveSuggestion, header, onRefine, onClip }) => {
    const { settings } = useSettings();
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('Analyzing data...');
    const [error, setError] = useState<AppError | null>(null);
    const [results, setResults] = useState<EnhancementResult | null>(null);

    const handleFileSelect = (file: File | null) => {
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (isImage || isVideo) {
            setSourceFile(file);
            setFileType(isImage ? 'image' : 'video');
            if (previewUrl && typeof window !== 'undefined') URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(file));
            setError(null);
            setResults(null);
        } else {
            setError({ message: 'Unsupported format. Please use an image or video file.' });
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleRemoveMedia = (e: React.MouseEvent | null) => {
        if (e) e.stopPropagation();
        if (previewUrl && typeof window !== 'undefined') URL.revokeObjectURL(previewUrl);
        setSourceFile(null);
        setPreviewUrl(null);
        setFileType(null);
        setError(null);
        setResults(null);
        if (fileInputRef.current) (fileInputRef.current as any).value = "";
    };

    const captureVideoFrame = (): string | null => {
        if (!videoRef.current || fileType !== 'video') return null;
        
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        return dataUrl.split(',')[1];
    };

    const handleAbstract = useCallback(async () => {
        if (!sourceFile) {
            setError({ message: 'Please upload a source file first.' });
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults(null);

        try {
            let base64Data: string;

            if (fileType === 'video') {
                setLoadingMessage('Capturing video frame...');
                const capturedData = captureVideoFrame();
                if (!capturedData) throw new Error("Failed to capture frame from video.");
                base64Data = capturedData;
            } else {
                setLoadingMessage('Encoding image data...');
                base64Data = await fileToBase64(sourceFile, true);
            }

            setLoadingMessage('Analyzing visual features...');
            // Using generic defaults for abstraction
            const result = await abstractImage(base64Data, PROMPT_DETAIL_LEVELS.MEDIUM, 'General', settings);
            setResults(result);
        } catch (err: any) {
            setError({ message: err.message || "Abstraction failed." });
        } finally {
            setIsLoading(false);
        }
    }, [sourceFile, fileType, settings]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 overflow-hidden h-full bg-base-100">
            {/* Left Sidebar: Form */}
            <div className="lg:col-span-1 bg-base-100 flex flex-col min-h-0 border-r border-base-300">
                {header}
                <header className="p-6 border-b border-base-300 bg-base-200/10 h-16 flex items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Source Material</h3>
                </header>
                <div className="p-6 flex flex-col gap-6 flex-grow min-h-0 overflow-hidden">
                    <div 
                        className={`relative flex-grow w-full border-2 border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-colors group overflow-hidden ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/10 hover:border-primary/50'}`}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onClick={() => !previewUrl && (fileInputRef.current as any)?.click()}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={(e) => handleFileSelect((e.currentTarget as any).files?.[0] || null)} 
                            className="hidden" 
                            accept="image/*,video/*"
                        />
                        
                        {!previewUrl ? (
                            <div className="text-center opacity-20 transition-opacity group-hover:opacity-40 p-12">
                                <div className="flex justify-center gap-4 mb-4">
                                    <PhotoIcon className="w-10 h-10" />
                                    <FilmIcon className="w-10 h-10" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest">Select Image or Video</p>
                                <p className="text-[9px] font-bold text-base-content/40 mt-2 uppercase">MP4, WEBM, JPG, PNG</p>
                            </div>
                        ) : (
                            <div className="w-full h-full relative bg-black" onClick={e => e.stopPropagation()}>
                                {fileType === 'video' ? (
                                    <video 
                                        ref={videoRef}
                                        src={previewUrl} 
                                        controls 
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <img 
                                        src={previewUrl} 
                                        className="w-full h-full object-cover" 
                                        alt="Source material" 
                                    />
                                )}
                                <button onClick={() => handleRemoveMedia(null)} className="btn btn-xs btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 shadow-2xl z-10 rounded-none">
                                    <CloseIcon className="w-3 h-3"/>
                                </button>
                                {fileType === 'video' && (
                                    <div className="absolute bottom-2 left-2 pointer-events-none">
                                        <div className="badge badge-primary rounded-none font-black text-[7px] tracking-widest px-2 opacity-60">PAUSE ON FRAME</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="text-[9px] font-bold text-base-content/30 uppercase leading-relaxed text-center">
                        Deconstruct visual data into raw descriptive tokens. Use the IMPROVE tool after extraction for model-specific tuning.
                    </p>
                </div>
                <footer className="h-14 border-t border-base-300 bg-base-100 flex items-stretch flex-shrink-0">
                    <button 
                        onClick={() => !isLoading && handleRemoveMedia(null)} 
                        className="btn btn-ghost h-full rounded-none border-none border-r border-base-300 flex-1 font-black text-[10px] tracking-widest text-error/40 hover:text-error uppercase"
                    >
                        RESET
                    </button>
                    <button 
                        onClick={handleAbstract} 
                        disabled={isLoading || !sourceFile} 
                        className="btn btn-primary h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase shadow-none"
                    >
                        {isLoading ? '...' : 'ANALYZE'}
                    </button>
                </footer>
            </div>
            {/* Main Output Column: Results */}
            <div className="lg:col-span-2 bg-base-100 flex flex-col min-h-0">
                 <header className="p-6 border-b border-base-300 bg-base-200/10 h-16 flex items-center">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> NEURAL ABSTRACTION
                    </h2>
                </header>
                <div className="flex-grow p-0 overflow-y-auto custom-scrollbar bg-base-200/5 flex flex-col">
                    {isLoading ? (
                        <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6">
                            <LoadingSpinner />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse -mt-4">{loadingMessage}</p>
                        </div>
                    ) : error ? (
                        <div className="p-8">
                            <div className="alert alert-error rounded-none border-2">
                                <span className="font-black uppercase text-[10px] tracking-widest">{error.message}</span>
                            </div>
                        </div>
                    ) : results ? (
                        <div className="p-[1px] bg-base-300">
                            {results.suggestions.map((suggestion, index) => (
                                <SuggestionItem 
                                    key={index} 
                                    suggestionText={suggestion} 
                                    onSave={onSaveSuggestion}
                                    onRefine={onRefine}
                                    onClip={onClip}
                                    isAbstraction={true}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-10">
                            <SparklesIcon className="w-24 h-24 mb-6" />
                            <p className="text-xl font-black uppercase tracking-widest">Load media to extract prompt tokens</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};