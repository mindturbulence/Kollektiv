import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { abstractImage } from '../services/llmService';
import { extractFullMetadata, type ParsedMetadata } from '../utils/fileUtils';
import type { EnhancementResult } from '../types';
import { PROMPT_DETAIL_LEVELS } from '../constants';
import { PhotoIcon, CloseIcon, SparklesIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { SuggestionItem } from './SuggestionItem';
import { fileToBase64 } from '../utils/fileUtils';

const TerminalText = ({ text, delay = 0, className = "", centered = false }: { text: string; delay?: number; className?: string; centered?: boolean }) => {
    const [displayedText, setDisplayedText] = useState("");
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const startTimeout = setTimeout(() => {
            let i = 0;
            const interval = setInterval(() => {
                if (i < text.length) {
                    setDisplayedText(text.slice(0, i + 1));
                    i++;
                } else {
                    clearInterval(interval);
                    setIsComplete(true);
                }
            }, 30);
            return () => clearInterval(interval);
        }, delay * 1000);

        return () => {
            clearTimeout(startTimeout);
            setDisplayedText("");
            setIsComplete(false);
        };
    }, [text, delay]);

    return (
        <span className={`${className} ${centered ? 'flex justify-center' : 'inline-flex'} items-center gap-1`}>
            {displayedText}
            {!isComplete && (
                <motion.span 
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="w-2 h-4 bg-primary inline-block shrink-0"
                />
            )}
        </span>
    );
};

const panelVariants: Variants = {
    hidden: { 
        opacity: 0,
        scale: 0,
        transformOrigin: "top left"
    },
    visible: { 
        opacity: 1,
        scale: 1,
        transition: { 
            duration: 1.2, 
            ease: [0.16, 1, 0.3, 1] as any,
        }
    },
    exit: {
        opacity: 0,
        scale: 0,
        transformOrigin: "top left",
        transition: {
            duration: 0.8,
            ease: [0.7, 0, 0.84, 0] as any,
        }
    }
};

const sectionWipeVariants: Variants = {
    hidden: { 
        clipPath: 'inset(0 100% 0 0)',
        opacity: 0,
    },
    visible: (custom: number) => ({ 
        clipPath: 'inset(0 0% 0 0)',
        opacity: 1,
        transition: { 
            duration: 1.0, 
            ease: [0.16, 1, 0.3, 1] as any,
            delay: custom
        }
    }),
    exit: {
        clipPath: 'inset(0 100% 0 0)',
        opacity: 0,
        transition: {
            duration: 0.5,
            ease: [0.7, 0, 0.84, 0] as any,
        }
    }
};

const contentVariants: Variants = {
    hidden: { opacity: 0, y: 5 },
    visible: (custom: number) => ({ 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.4, ease: "easeOut" as any, delay: custom }
    }),
    exit: {
        opacity: 0,
        y: 5,
        transition: { duration: 0.3, ease: "easeIn" as any }
    }
};

const PanelLine = ({ position, delay = 0 }: { position: 'top' | 'bottom' | 'left' | 'right', delay?: number }) => {
    const variants: Variants = {
        hidden: { scaleX: 0, scaleY: 0, opacity: 0 },
        visible: { 
            scaleX: 1, scaleY: 1, opacity: 1,
            transition: { duration: 1, ease: [0.16, 1, 0.3, 1] as any, delay }
        }
    };

    const styles: React.CSSProperties = {
        position: 'absolute',
        backgroundColor: 'oklch(var(--bc) / 0.05)',
        zIndex: 40,
        pointerEvents: 'none',
    };

    if (position === 'top') { Object.assign(styles, { top: 0, left: 0, right: 0, height: '1px', originX: 0 }); }
    if (position === 'bottom') { Object.assign(styles, { bottom: 0, left: 0, right: 0, height: '1px', originX: 1 }); }
    if (position === 'left') { Object.assign(styles, { top: 0, bottom: 0, left: 0, width: '1px', originY: 1 }); }
    if (position === 'right') { Object.assign(styles, { top: 0, bottom: 0, right: 0, width: '1px', originY: 0 }); }

    return <motion.div initial="hidden" animate="visible" variants={variants} style={styles} />;
};

const ScanLine = ({ delay = 0 }: { delay?: number }) => (
    <motion.div
        className="absolute left-0 right-0 h-[2px] bg-primary/20 z-40 pointer-events-none"
        initial={{ top: '0%', opacity: 0 }}
        animate={{ top: ['0%', '100%'], opacity: [0, 0.5, 0] }}
        transition={{ delay, duration: 1.5, ease: "linear", repeat: Infinity, repeatDelay: 5 }}
    />
);

interface MediaAnalyzerProps {
  onSaveSuggestion: (suggestionText: string, title?: string) => void;
  onSaveAsPreset?: (suggestionText: string) => void;
  onRefine: (text: string) => void;
  onClip: (text: string, title?: string) => void;
  header: React.ReactNode;
  isNavigating?: boolean;
}

export const MediaAnalyzer: React.FC<MediaAnalyzerProps> = ({ 
    onSaveSuggestion, 
    onSaveAsPreset, 
    onRefine, 
    onClip, 
    header,
    isNavigating = false
}) => {
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
            <motion.aside 
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.2} />
                <PanelLine position="bottom" delay={0.3} />
                <PanelLine position="left" delay={0.4} />
                <PanelLine position="right" delay={0.5} />
                <ScanLine delay={2} />

                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    {header}
                    <motion.header 
                        variants={sectionWipeVariants}
                        custom={1.2}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-6 h-16 flex items-center justify-between bg-base-100/10 backdrop-blur-md panel-header flex-shrink-0 z-20 border-b border-primary/10"
                    >
                        <TerminalText text="MEDIA INPUT" delay={2.0} className="text-[10px] font-black uppercase font-sf-mono text-primary" />
                    </motion.header>

                    <div className="flex flex-col flex-grow min-h-0 overflow-hidden">
                        <motion.div 
                            variants={sectionWipeVariants}
                            custom={1.4}
                            initial="hidden"
                            animate="visible"
                            className="flex flex-col flex-grow min-h-0 overflow-hidden border-b border-primary/10"
                        >
                                <motion.div 
                                    variants={contentVariants}
                                    custom={2.2}
                                    initial="hidden"
                                    animate="visible"
                                    className="p-6 flex flex-col gap-6 flex-grow min-h-0 overflow-hidden"
                                >
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
                                                <div className="flex justify-center mb-6">
                                                    <PhotoIcon className="w-10 h-10" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <TerminalText text="Select Image or Video" delay={2.4} className="text-[10px] font-black uppercase block" centered />
                                                    <TerminalText text="MP4, WEBM, JPG, PNG" delay={2.9} className="text-[9px] font-bold text-base-content/40 uppercase block" centered />
                                                </div>
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
                                        <div className="h-14 flex items-stretch flex-shrink-0 animate-fade-in gap-1.5">
                                            <button 
                                                onClick={handleSaveWorkflow}
                                                className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate"
                                            >
                                                EXPORT JSON
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                                <motion.footer 
                                    variants={sectionWipeVariants}
                                    custom={1.6}
                                    initial="hidden"
                                    animate="visible"
                                    className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                                >
                                    <motion.button 
                                        variants={contentVariants}
                                        custom={2.4}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        onClick={() => !isLoading && handleReset(null)} 
                                        className="btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider text-error/40 hover:text-error border border-base-content/5 btn-snake"
                                    >
                                        <span/><span/><span/><span/>
                                        RESET
                                    </motion.button>
                                    <motion.button 
                                        variants={contentVariants}
                                        custom={2.5}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        onClick={handleAnalyze} 
                                        disabled={isLoading || !sourceFile} 
                                        className={`btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider ${activeResultType === 'abstraction' ? 'text-primary' : ''} disabled:opacity-30 border border-base-content/5 disabled:cursor-not-allowed btn-snake`}
                                    >
                                        <span/><span/><span/><span/>
                                        {isLoading && activeResultType === 'abstraction' ? '...' : 'ANALYZE'}
                                    </motion.button>
                                    <motion.button 
                                        variants={contentVariants}
                                        custom={2.6}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        onClick={handleReadMetadata} 
                                        disabled={isLoading || !sourceFile || fileType !== 'image'} 
                                        className={`btn btn-sm btn-ghost flex-1 h-full rounded-none font-normal text-[13px] tracking-wider ${activeResultType === 'metadata' ? 'text-primary' : ''} disabled:opacity-30 border border-base-content/5 disabled:cursor-not-allowed btn-snake`}
                                    >
                                        <span/><span/><span/><span/>
                                        {isLoading && activeResultType === 'metadata' ? '...' : 'READ'}
                                    </motion.button>
                                </motion.footer>
                            </motion.div>
                        </div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20 z-20 pointer-events-none" />
            </motion.aside>

            {/* center Column: Results (Merged) */}
            <motion.main 
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-9 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />

                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header 
                        variants={sectionWipeVariants}
                        custom={1.4}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-6 h-16 flex items-center justify-between bg-base-100/10 backdrop-blur-md panel-header flex-shrink-0 z-20 border-b border-primary/10"
                    >
                        <div className="flex items-center gap-1.5">
                            <TerminalText text="ANALYZED MEDIA" delay={2.2} className="text-[10px] font-black uppercase font-sf-mono text-primary" />
                            {metadataResults && (
                                <button 
                                    onClick={() => metadataResults && setActiveResultType('metadata')}
                                    className="text-[10px] font-black uppercase tracking-[0.4em] font-sf-mono text-primary/30 hover:text-primary/60 transition-colors"
                                >
                                    <TerminalText text="METADATA" delay={2.2} className={activeResultType === 'metadata' ? 'text-primary' : 'text-primary/30'} />
                                </button>
                            )}
                        </div>
                    </motion.header>

                    <div ref={resultsScrollerRef} className="flex-grow overflow-y-auto flex flex-col">
                        <motion.div 
                            key={activeResultType || 'empty'}
                            variants={sectionWipeVariants}
                            custom={1.6}
                            initial="hidden"
                            animate="visible"
                            className="flex-grow overflow-y-auto flex flex-col"
                        >
                                {error && (
                                    <motion.div variants={contentVariants} className="p-6">
                                        <div className="alert alert-error rounded-none border-2 border-error/20 bg-transparent">
                                            <span className="font-black uppercase text-[10px] tracking-widest text-error">{error}</span>
                                        </div>
                                    </motion.div>
                                )}

                                {isLoading ? (
                                    <motion.div 
                                        variants={contentVariants}
                                        className="flex-grow flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden"
                                    >
                                        <ScanLine delay={0} />
                                        <div className="relative z-10 flex flex-col items-center">
                                            <LoadingSpinner className="w-16 h-16 text-primary mb-8" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary animate-pulse mb-2">{loadingMessage}</h3>
                                        </div>
                                    </motion.div>
                                ) : activeResultType === 'abstraction' && abstractionResults ? (
                                    <motion.div 
                                        variants={contentVariants}
                                        className="bg-transparent"
                                    >
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
                                    </motion.div>
                                ) : activeResultType === 'metadata' && metadataResults ? (
                                    <motion.div 
                                        variants={contentVariants}
                                        className="p-6 space-y-8"
                                    >
                                        <section className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <TerminalText text="POSITIVE PROMPT" delay={2.4} className="text-[9px] font-black uppercase text-primary/40" />
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
                                                <TerminalText text="TECHNICAL PARAMETERS" delay={2.6} className="text-[9px] font-black uppercase text-primary/40" />
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
                                                <TerminalText text="RAW STREAM" delay={2.8} className="text-[9px] font-black uppercase text-base-content/20" />
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
                                    </motion.div>
                                ) : (
                                     <motion.div 
                                        variants={contentVariants}
                                        className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-20 transition-opacity hover:opacity-40"
                                    >
                                        <div className="flex justify-center mb-6">
                                            <SparklesIcon className="w-10 h-10" />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <TerminalText text="Awaiting Neural Input" delay={2.4} className="text-[10px] font-black uppercase block" centered />
                                            <TerminalText text="SYSTEM_IDLE_STATE" delay={2.9} className="text-[9px] font-bold text-base-content/40 uppercase block" centered />
                                        </div>
                                    </motion.div>
                                )}
                        </motion.div>
                    </div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20 z-20 pointer-events-none" />
            </motion.main>
        </div>
    );
};
