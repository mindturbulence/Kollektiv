import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DownloadIcon, BookmarkIcon, SparklesIcon, CopyIcon, BracesIcon, RefreshIcon, PlayIcon, ArchiveIcon } from './icons';
import { generateWithImagen, generateWithNanoBanana, generateWithVeo } from '../services/llmService';
import LoadingSpinner from './LoadingSpinner';

interface SuggestionItemProps {
  suggestionText: string;
  targetAI?: string;
  onSave: (suggestionText: string) => void;
  onSaveAsPreset?: (suggestionText: string) => void;
  onRefine?: (suggestionText: string) => void;
  onClip?: (suggestionText: string) => void;
  isAbstraction?: boolean;
  breakdown?: any;
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ 
    suggestionText, 
    targetAI = '', 
    onSave, 
    onSaveAsPreset,
    onRefine, 
    onClip,
    isAbstraction = false,
    breakdown
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [clipped, setClipped] = useState<boolean>(false);
  const [presetSaved, setPresetSaved] = useState<boolean>(false);
  const [jsonCopied, setJsonCopied] = useState<boolean>(false);
  const [isJsonOpen, setIsJsonOpen] = useState<boolean>(false);
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string>('Generating...');

  const isGoogleProduct = useMemo(() => {
    const target = targetAI.toLowerCase();
    return target.includes('imagen') || 
           target.includes('nano banana') || 
           target.includes('veo');
  }, [targetAI]);

  const handleCopy = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
      (window as any).navigator.clipboard.writeText(suggestionText)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000); 
        })
        .catch((err: any) => {
          console.error('Failed to copy text: ', err);
        });
    }
  }, [suggestionText]);

  const handleSave = useCallback(() => {
    onSave(suggestionText);
  }, [suggestionText, onSave]);

  const jsonData = useMemo(() => {
    const baseBreakdown = breakdown || {
      subject: "Analyzed Subject",
      environment: "Analytical interpretation",
      lighting: "Detected context",
      composition: "Inferred framing"
    };
    
    return {
      ...baseBreakdown,
      targetAI,
      exportedAt: new Date().toISOString(),
      generator: "Kollektiv Toolbox"
    };
  }, [breakdown, targetAI]);

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breakdown_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonData]);

  const handleSaveAsPreset = useCallback(() => {
    if (presetSaved || !onSaveAsPreset) return;
    onSaveAsPreset(suggestionText);
    setPresetSaved(true);
    setTimeout(() => setPresetSaved(false), 3000);
  }, [suggestionText, onSaveAsPreset, presetSaved]);

  const handleClip = useCallback(() => {
    if (clipped || !onClip) return;
    onClip(suggestionText);
    setClipped(true);
    setTimeout(() => setClipped(false), 2000);
  }, [suggestionText, onClip, clipped]);
  
  const handleRefine = useCallback(() => {
      onRefine?.(suggestionText);
  }, [onRefine, suggestionText]);

  const handleCopyJson = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
      (window as any).navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
        .then(() => {
          setJsonCopied(true);
          setTimeout(() => setJsonCopied(false), 2000);
        })
        .catch((err: any) => {
          console.error('Failed to copy JSON: ', err);
        });
    }
  }, [jsonData]);

  const handleTryGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setLoadingMsg('Connecting to AI...');
    
    try {
        const target = targetAI.toLowerCase();
        let resultUrl = '';
        
        if (target.includes('imagen')) {
            setLoadingMsg('Imaging your prompt...');
            resultUrl = await generateWithImagen(suggestionText);
        } else if (target.includes('nano banana')) {
            setLoadingMsg('Snapshot sequence...');
            resultUrl = await generateWithNanoBanana(suggestionText);
        } else if (target.includes('veo')) {
            resultUrl = await generateWithVeo(suggestionText, (msg) => setLoadingMsg(msg));
        } else {
            throw new Error("Direct generation not supported for this model yet.");
        }
        
        setMediaUrl(resultUrl);
    } catch (err: any) {
        console.error("Generation failed:", err);
        setGenerationError(err.message || "An unexpected error occurred during generation.");
    } finally {
        setIsGenerating(false);
    }
  };

  const isVideo = targetAI.toLowerCase().includes('veo');

  return (
    <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-content/5 last:border-b-0">
        <div className="p-6 md:p-8 flex flex-col w-full h-full">
            {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                    <LoadingSpinner size={48} />
                    <p className="font-black text-[10px] uppercase tracking-[0.2em] text-primary animate-pulse">{loadingMsg}</p>
                </div>
            ) : mediaUrl ? (
                <div className="space-y-4 animate-fade-in">
                    <div className="relative group bg-black aspect-video flex items-center justify-center overflow-hidden">
                        {isVideo ? (
                            <video src={mediaUrl} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : (
                            <img src={mediaUrl} alt="Generated result" className="w-full h-full object-contain" />
                        )}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                             <a href={mediaUrl} download={`kollektiv_${targetAI.replace(/\s+/g, '_')}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`} className="form-btn form-btn-primary h-8 px-4 tracking-widest shadow-2xl">
                                <DownloadIcon className="w-4 h-4 mr-2"/> EXPORT
                            </a>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">{targetAI} Result Archive</span>
                         <button onClick={() => setMediaUrl(null)} className="uppercase tracking-widest text-base-content/30 hover:text-primary transition-colors">Close Archive</button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Section */}
                    <div className="mb-6 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
                                {isAbstraction ? 'ANALYZED MEDIA' : (targetAI || 'REFINED RESULT')}
                            </span>
                            <div className="flex gap-1">
                                <div className="w-1 h-1 bg-primary/30"></div>
                                <div className="w-1 h-1 bg-primary/30"></div>
                                <div className="w-1 h-1 bg-primary/30"></div>
                            </div>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="flex-grow space-y-6">
                        <div className="relative group/content">
                            <p className="text-base font-medium leading-relaxed text-base-content/80 italic">
                                "{suggestionText}"
                            </p>
                        </div>
                    </div>

                    {generationError && (
                        <div className="p-2 bg-error/10 border border-error/20 mt-4 animate-fade-in">
                             <p className="text-error font-bold text-[9px] uppercase tracking-widest">{generationError}</p>
                        </div>
                    )}

                    {/* JSON Breakdown Slider */}
                    <AnimatePresence>
                        {isJsonOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="mt-8 p-6 bg-base-200/50 border border-primary/10 relative corner-frame p-[1px]">
                                    <div className="bg-base-300/30 p-6 relative z-10">
                                        <header className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-2">
                                                <BracesIcon className="w-3.5 h-3.5 text-primary" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Processed Anatomy</span>
                                            </div>
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleCopyJson}
                                                    className="uppercase tracking-widest text-base-content/40 hover:text-primary transition-colors flex items-center gap-1.5"
                                                >
                                                    <CopyIcon className="w-3 h-3" />
                                                    {jsonCopied ? 'COPIED' : 'COPY RAW'}
                                                </button>
                                                <button
                                                    onClick={handleDownloadJson}
                                                    className="uppercase tracking-widest text-base-content/40 hover:text-primary transition-colors flex items-center gap-1.5"
                                                >
                                                    <DownloadIcon className="w-3 h-3" />
                                                    DOWNLOAD
                                                </button>
                                            </div>
                                        </header>
                                        <pre className="text-[11px] font-mono text-base-content/70 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-80 custom-scrollbar">
                                            {JSON.stringify(jsonData, null, 2)}
                                        </pre>
                                    </div>
                                    {/* Sub-Corner Accents */}
                                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/30 z-20" />
                                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/30 z-20" />
                                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/30 z-20" />
                                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/30 z-20" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer Section - Actions */}
                    <div className="mt-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="flex-grow h-px bg-base-300/50"></div>
                        </div>

                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <button
                                    onClick={() => setIsJsonOpen(!isJsonOpen)}
                                    className={`text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 group/btn ${isJsonOpen ? 'text-primary' : 'text-base-content/30 hover:text-primary'}`}
                                >
                                    <BracesIcon className={`w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform ${isJsonOpen ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
                                    {isJsonOpen ? 'CLOSE JSON' : 'JSON VERSION'}
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="uppercase tracking-widest -content/30 hover:text-primary transition-colors flex items-center gap-2 group/btn"
                                >
                                    <ArchiveIcon className="w-3.5 h-3.5 opacity-40 group-hover/btn:opacity-100" />
                                    SAVE
                                </button>
                            </div>

                            <div className="flex items-center gap-6">
                                {onRefine && (
                                    <button 
                                        onClick={handleRefine} 
                                        className="uppercase tracking-widest -content/30 hover:text-primary transition-colors flex items-center gap-2 group/btn"
                                    >
                                        <RefreshIcon className="w-3.5 h-3.5 opacity-40 group-hover/btn:opacity-100" />
                                        REFINE
                                    </button>
                                )}
                                {onSaveAsPreset && (
                                    <button
                                        onClick={handleSaveAsPreset}
                                        disabled={presetSaved}
                                        className="uppercase tracking-widest -content/30 hover:text-primary transition-colors flex items-center gap-2 group/btn"
                                    >
                                        <SparklesIcon className="w-3.5 h-3.5 opacity-40 group-hover/btn:opacity-100" />
                                        {presetSaved ? 'MAPPED' : 'MAP TO REF'}
                                    </button>
                                )}
                                {onClip && (
                                    <button
                                        onClick={handleClip}
                                        className="uppercase tracking-widest -content/30 hover:text-primary transition-colors flex items-center gap-2 group/btn"
                                    >
                                        <BookmarkIcon className="w-3.5 h-3.5 opacity-40 group-hover/btn:opacity-100" />
                                        {clipped ? 'CLIPPED' : 'CLIP'}
                                    </button>
                                )}
                                <button
                                    onClick={handleCopy}
                                    className="uppercase tracking-widest -content/30 hover:text-primary transition-colors flex items-center gap-2 group/btn"
                                >
                                    <CopyIcon className="w-3.5 h-3.5 opacity-40 group-hover/btn:opacity-100" />
                                    {copied ? 'COPIED' : 'COPY'}
                                </button>
                            </div>
                        </div>

                        {/* Rendering Row (Optional) */}
                        {isGoogleProduct && !mediaUrl && (
                            <div className="flex items-center gap-4 pt-4 border-t border-base-300/5">
                                <button 
                                    onClick={handleTryGenerate} 
                                    className="btn btn-xs btn-ghost gap-2 h-8 px-4 rounded-none tracking-widest text-primary uppercase btn-snake bg-primary/5"
                                >
                                    <span/><span/><span/><span/>
                                    <PlayIcon className="w-3 h-3" />
                                    RENDER
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    </div>
  );
};
