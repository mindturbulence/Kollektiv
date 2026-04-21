import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { abstractImage } from '../services/llmService';
import { extractFullMetadata, type ParsedMetadata } from '../utils/fileUtils';
import type { EnhancementResult } from '../types';
import { PROMPT_DETAIL_LEVELS } from '../constants';
import { PhotoIcon, CloseIcon, SparklesIcon, FilmIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { SuggestionItem } from './SuggestionItem';
import { fileToBase64 } from '../utils/fileUtils';

interface MediaAnalyzerProps {
  onSaveSuggestion: (suggestionText: string, title?: string) => void;
  onSaveAsPreset?: (suggestionText: string) => void;
  onRefine: (text: string) => void;
  onClip: (text: string, title?: string) => void;
  header: React.ReactNode;
}

export const MediaAnalyzer: React.FC<MediaAnalyzerProps> = ({ onSaveSuggestion, onSaveAsPreset, onRefine, onClip, header }) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('Processing...');
    const [error, setError] = useState<string | null>(null);
    
    // Results state
    const [abstractionResults, setAbstractionResults] = useState<EnhancementResult | null>(null);
    const [metadataResults, setMetadataResults] = useState<ParsedMetadata | null>(null);
    const [activeResultType, setActiveResultType] = useState<'abstraction' | 'metadata' | null>(null);
    const [copiedRaw, setCopiedRaw] = useState(false);

    const resultsScrollerRef = useRef<HTMLDivElement>(null);

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
            setAbstractionResults(null);
            setMetadataResults(null);
            setActiveResultType(null);
        } else {
            setError('Unsupported format. Please use an image or video file.');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleReset = (e: React.MouseEvent | null) => {
        if (e) e.stopPropagation();
        if (previewUrl && typeof window !== 'undefined') URL.revokeObjectURL(previewUrl);
        setSourceFile(null);
        setPreviewUrl(null);
        setFileType(null);
        setError(null);
        setAbstractionResults(null);
        setMetadataResults(null);
        setActiveResultType(null);
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

    const handleAnalyze = useCallback(async () => {
        if (!sourceFile) {
            setError('Please upload a source file first.');
            return;
        }

        setIsBusy(true);
        setIsLoading(true);
        setError(null);
        setAbstractionResults(null);
        setLoadingMessage('Analyzing visual features...');

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
            const result = await abstractImage(base64Data, PROMPT_DETAIL_LEVELS.MEDIUM, 'General', settings);
            setAbstractionResults(result);
            setActiveResultType('abstraction');
        } catch (err: any) {
            setError(err.message || "Abstraction failed.");
        } finally {
            setIsLoading(false);
            setIsBusy(false);
        }
    }, [sourceFile, fileType, settings]);

    const handleReadMetadata = useCallback(async () => {
        if (!sourceFile) {
            setError('Please upload a source file first.');
            return;
        }

        if (fileType !== 'image') {
            setError('Metadata reading is only supported for images (PNG/JPG).');
            return;
        }

        setIsBusy(true);
        setIsLoading(true);
        setError(null);
        setMetadataResults(null);
        setLoadingMessage('Scanning metadata...');

        try {
            const result = await extractFullMetadata(sourceFile);
            if (result) {
                setMetadataResults(result);
                setActiveResultType('metadata');
            } else {
                setError("No metadata detected in this file.");
            }
        } catch (err: any) {
            setError("Metadata extraction failed.");
        } finally {
            setIsLoading(false);
            setIsBusy(false);
        }
    }, [sourceFile, fileType]);

    const handleSaveWorkflow = () => {
        if (!metadataResults?.workflow) return;
        const blob = new Blob([metadataResults.workflow], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow_${sourceFile?.name.replace(/\.[^/.]+$/, "") || Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyRaw = () => {
        const textToCopy = metadataResults?.raw || metadataResults?.workflow || '';
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy);
        setCopiedRaw(true);
        setTimeout(() => setCopiedRaw(false), 2000);
    };

    const filteredParams = useMemo(() => {
        if (!metadataResults?.params) return [];
        return Object.entries(metadataResults.params).filter(([key]) => {
            const lower = key.trim().toLowerCase();
            return (
                lower !== 'module 1' && 
                lower !== 'raw stream' && 
                lower !== 'workflow' && 
                lower !== 'prompt' && 
                lower !== 'negative_prompt' &&
                lower !== 'all_prompts'
            );
        });
    }, [metadataResults]);

    const hasPrompt = !!metadataResults?.prompt && !metadataResults.prompt.includes('extraction failed') && !metadataResults.prompt.includes('No text nodes');
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-4 relative auto-rows-fr">
            
            {/* Media Input Area */}
            <aside className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10">
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    {header}
                    <header className="p-6 h-16 flex items-center justify-between bg-base-100/10 backdrop-blur-md panel-header">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Media Input</h3>
                        <div className="flex gap-1">
                            <div className="w-1 h-1 bg-primary/30"></div>
                            <div className="w-1 h-1 bg-primary/30"></div>
                            <div className="w-1 h-1 bg-primary/30"></div>
                        </div>
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
                                    <button onClick={() => handleReset(null)} className="btn btn-xs btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 shadow-2xl z-10 rounded-none">
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

                        {metadataResults?.workflow && (
                            <div className="h-14 flex items-stretch flex-shrink-0 animate-fade-in">
                                <button 
                                    onClick={handleSaveWorkflow}
                                    className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate"
                                >
                                    EXPORT JSON
                                </button>
                            </div>
                        )}
                    </div>
                    <footer className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer">
                        <button 
                            onClick={() => !isLoading && handleReset(null)} 
                            className="btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider text-error/40 hover:text-error btn-snake"
                        >
                            <span/><span/><span/><span/>
                            RESET
                        </button>
                        <button 
                            onClick={handleAnalyze} 
                            disabled={isLoading || !sourceFile} 
                            className={`btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider ${activeResultType === 'abstraction' ? 'text-primary' : ''} disabled:opacity-30 disabled:cursor-not-allowed btn-snake`}
                        >
                            <span/><span/><span/><span/>
                            {isLoading && activeResultType === 'abstraction' ? '...' : 'ANALYZE'}
                        </button>
                        <button 
                            onClick={handleReadMetadata} 
                            disabled={isLoading || !sourceFile || fileType !== 'image'} 
                            className={`btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider ${activeResultType === 'metadata' ? 'text-primary' : ''} disabled:opacity-30 disabled:cursor-not-allowed btn-snake`}
                        >
                            <span/><span/><span/><span/>
                            {isLoading && activeResultType === 'metadata' ? '...' : 'READ'}
                        </button>
                    </footer>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </aside>

            {/* center Column: Results (Merged) */}
            <main className="lg:col-span-9 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10">
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <header className="p-6 h-16 flex items-center justify-between bg-base-100/10 backdrop-blur-md panel-header">
                        <div className="flex items-center gap-6">
                            <h2 className={`text-xs font-black uppercase tracking-[0.4em] flex items-center gap-3 transition-colors cursor-pointer ${activeResultType === 'abstraction' ? 'text-primary' : 'text-base-content/20 hover:text-base-content/40'}`} onClick={() => abstractionResults && setActiveResultType('abstraction')}>
                                <div className={`w-2 h-2 rounded-none ${activeResultType === 'abstraction' ? 'bg-primary animate-pulse' : 'bg-base-content/10'}`}></div> 
                                ANALYZED MEDIA
                            </h2>
                            {metadataResults && (
                                <h2 className={`text-xs font-black uppercase tracking-[0.4em] flex items-center gap-3 transition-colors cursor-pointer ${activeResultType === 'metadata' ? 'text-primary' : 'text-base-content/20 hover:text-base-content/40'}`} onClick={() => metadataResults && setActiveResultType('metadata')}>
                                    <div className={`w-2 h-2 rounded-none ${activeResultType === 'metadata' ? 'bg-primary animate-pulse' : 'bg-base-content/10'}`}></div> 
                                    METADATA
                                </h2>
                            )}
                        </div>
                    </header>
                    <div ref={resultsScrollerRef} className="flex-grow overflow-y-auto flex flex-col">
                        {error && (
                            <div className="p-6 animate-fade-in">
                                <div className="alert alert-error rounded-none border-2 border-error/20 bg-transparent">
                                    <span className="font-black uppercase text-[10px] tracking-widest text-error">{error}</span>
                                </div>
                            </div>
                        )}

                        {isLoading ? (
                            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                                <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
                                <div className="relative z-10 flex flex-col items-center">
                                    <LoadingSpinner className="w-16 h-16 text-primary mb-8" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.5em] text-primary animate-pulse mb-2">{loadingMessage}</h3>
                                </div>
                            </div>
                        ) : activeResultType === 'abstraction' && abstractionResults ? (
                            <div className="bg-transparent">
                                {abstractionResults.suggestions.map((suggestion, index) => (
                                    <SuggestionItem 
                                        key={index} 
                                        suggestionText={suggestion} 
                                        onSave={onSaveSuggestion}
                                        onSaveAsPreset={onSaveAsPreset}
                                        onRefine={onRefine}
                                        onClip={onClip}
                                        isAbstraction={true}
                                    />
                                ))}
                            </div>
                        ) : activeResultType === 'metadata' && metadataResults ? (
                            <div className="p-6 space-y-8 animate-fade-in">
                                <section className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[9px] font-black uppercase tracking-widest text-primary/40">POSITIVE PROMPT</h4>
                                        <div className="flex gap-1.5 h-8">
                                            <button 
                                                onClick={() => onRefine(metadataResults.prompt)}
                                                disabled={!hasPrompt}
                                                className="btn btn-sm btn-ghost h-full rounded-none text-primary px-4 font-normal text-[12px] tracking-wider uppercase btn-snake"
                                            >
                                                <span/><span/><span/><span/>
                                                IMPROVE
                                            </button>
                                            <button 
                                                onClick={() => onClip(metadataResults.prompt, `Info: ${sourceFile?.name}`)}
                                                disabled={!hasPrompt}
                                                className="btn btn-sm btn-ghost h-full rounded-none px-4 font-normal text-[12px] tracking-wider uppercase btn-snake"
                                            >
                                                <span/><span/><span/><span/>
                                                CLIP
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm font-medium leading-relaxed text-base-content/80 font-mono bg-transparent p-3">
                                        {hasPrompt ? metadataResults.prompt : 'NO READABLE DATA.'}
                                    </p>
                                </section>

                                {filteredParams.length > 0 && (
                                    <section className="space-y-4 pt-6 panel-header">
                                        <h4 className="text-[9px] font-black uppercase tracking-widest text-primary/40">TECHNICAL PARAMETERS</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4">
                                            {filteredParams.map(([key, val]) => (
                                                <div key={key} className="flex flex-col border-b border-base-300/30 pb-2">
                                                    <span className="text-[8px] font-black uppercase text-base-content/20 tracking-widest mb-1 truncate" title={key}>{key}</span>
                                                    <span className="text-xs font-mono font-bold text-base-content/60 break-words">{val}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className="space-y-4 pt-6 panel-header">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[9px] font-black uppercase tracking-widest text-base-content/20">RAW STREAM</h4>
                                        <button 
                                            onClick={handleCopyRaw}
                                            disabled={!metadataResults.raw && !metadataResults.workflow}
                                            className="btn btn-sm btn-ghost h-8 rounded-none px-4 font-normal text-[12px] tracking-wider uppercase btn-snake"
                                        >
                                            <span/><span/><span/><span/>
                                            {copiedRaw ? 'OK' : 'COPY'}
                                        </button>
                                    </div>
                                    <div className="p-3 bg-transparent text-[9px] font-mono text-base-content/30 break-words leading-relaxed max-h-32 overflow-y-auto">
                                        {metadataResults.raw || 'EMPTY STREAM.'}
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-10">
                                <SparklesIcon className="w-16 h-16 mb-6" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Neural Input</p>
                            </div>
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
    );
};
