import React, { useState, useCallback, useMemo } from 'react';
import { DownloadIcon, SparklesIcon, BookmarkIcon, RefreshIcon, CheckIcon, ArchiveIcon, BracesIcon } from './icons';
import { generateWithImagen, generateWithNanoBanana, generateWithVeo } from '../services/llmService';
import CopyIcon from './CopyIcon';
import LoadingSpinner from './LoadingSpinner';

interface SuggestionItemProps {
  suggestionText: string;
  targetAI?: string;
  onSave: (suggestionText: string) => void;
  onRefine?: (suggestionText: string) => void;
  onClip?: (suggestionText: string) => void;
  isAbstraction?: boolean;
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ 
    suggestionText, 
    targetAI = '', 
    onSave, 
    onRefine, 
    onClip,
    isAbstraction = false
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [clipped, setClipped] = useState<boolean>(false);
  
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
    if (saved) return;
    onSave(suggestionText);
    setSaved(true);
  }, [suggestionText, onSave, saved]);

  const handleClip = useCallback(() => {
    if (clipped || !onClip) return;
    onClip(suggestionText);
    setClipped(true);
    setTimeout(() => setClipped(false), 2000);
  }, [suggestionText, onClip, clipped]);
  
  const handleRefine = useCallback(() => {
      onRefine?.(suggestionText);
  }, [onRefine, suggestionText]);

  const handleDownloadJson = useCallback(() => {
    if (typeof window === 'undefined') return;

    const data = {
      prompt: suggestionText,
      targetAI,
      exportedAt: new Date().toISOString(),
      generator: "Kollektiv Toolbox"
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = (window as any).document.createElement('a');
    link.href = url;
    link.download = `kollektiv_prompt_${Date.now()}.json`;
    (window as any).document.body.appendChild(link);
    link.click();
    (window as any).document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [suggestionText, targetAI]);

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
    <div className={`w-full transition-all duration-300 bg-base-100 border border-base-300 mb-[1px] last:mb-0 ${isGenerating ? 'bg-primary/5' : ''}`}>
        <div className="p-4 md:p-6 flex flex-col h-full relative">
            {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                    <LoadingSpinner size={48} />
                    <p className="font-black text-[10px] uppercase tracking-[0.2em] text-primary animate-pulse">{loadingMsg}</p>
                </div>
            ) : mediaUrl ? (
                <div className="space-y-4 animate-fade-in">
                    <div className="relative group bg-black border border-base-300 aspect-video flex items-center justify-center overflow-hidden">
                        {isVideo ? (
                            <video src={mediaUrl} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : (
                            <img src={mediaUrl} alt="Generated result" className="w-full h-full object-contain" />
                        )}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                             <a href={mediaUrl} download={`kollektiv_${targetAI.replace(/\s+/g, '_')}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`} className="btn btn-sm btn-primary rounded-none shadow-2xl font-black text-[10px] tracking-widest px-4">
                                <DownloadIcon className="w-4 h-4 mr-2"/> EXPORT
                            </a>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">{targetAI} Result Archive</span>
                         <button onClick={() => setMediaUrl(null)} className="text-[9px] font-bold uppercase tracking-widest text-base-content/30 hover:text-primary transition-colors">Close Archive</button>
                    </div>
                </div>
            ) : (
                <>
                    {!isAbstraction && (
                        <div className="flex justify-between items-start gap-4 mb-2">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-primary/40">Refined Variant</span>
                            </div>
                        </div>
                    )}

                    <div className="flex-grow">
                        <p className="text-base font-medium leading-relaxed text-base-content/80 italic border-l-2 border-primary/10 pl-4 py-1">
                            "{suggestionText}"
                        </p>
                    </div>

                    {generationError && (
                        <div className="p-2 bg-error/10 border border-error/20 mt-4 animate-fade-in">
                             <p className="text-error font-bold text-[9px] uppercase tracking-widest">{generationError}</p>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-base-300">
                        <div className="flex items-center gap-1">
                            {isGoogleProduct && !mediaUrl && (
                                <button 
                                    onClick={handleTryGenerate} 
                                    className="btn btn-xs btn-primary rounded-none font-black text-[9px] tracking-widest px-4 shadow-sm"
                                >
                                    <SparklesIcon className="w-3 h-3 mr-1.5" />
                                    RENDER
                                </button>
                            )}
                            {onClip && (
                                <button onClick={handleClip} className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-3 hover:bg-base-300" disabled={clipped}>
                                    <BookmarkIcon className="w-3 h-3 mr-1.5 opacity-40"/> {clipped ? 'CLIPPED' : 'CLIP'}
                                </button>
                            )}
                            {onRefine && (
                                 <button onClick={handleRefine} className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-3 hover:bg-base-300">
                                    <RefreshIcon className="w-3 h-3 mr-1.5 opacity-40"/> RE-REFINE
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleSave}
                                disabled={saved}
                                className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-3 hover:bg-base-300"
                            >
                                {saved ? <><CheckIcon className="w-3 h-3 mr-1.5 text-success"/> OK</> : <><ArchiveIcon className="w-3 h-3 mr-1.5 opacity-40"/> SAVE</>}
                            </button>
                            <button
                                onClick={handleDownloadJson}
                                className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-3 hover:bg-base-300"
                            >
                                <BracesIcon className="w-3 h-3 mr-1.5 opacity-40"/> JSON
                            </button>
                            <button
                                onClick={handleCopy}
                                className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-3 hover:bg-base-300"
                            >
                                {copied ? <><CheckIcon className="w-3 h-3 mr-1.5 text-success" /> OK</> : <><CopyIcon className="w-3.5 h-3.5 mr-1.5 opacity-40" /> COPY</>}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};
