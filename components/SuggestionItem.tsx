import React, { useState, useCallback, useMemo } from 'react';
import { DownloadIcon } from './icons';
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
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ 
    suggestionText, 
    targetAI = '', 
    onSave, 
    onSaveAsPreset,
    onRefine, 
    onClip,
    isAbstraction = false
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [clipped, setClipped] = useState<boolean>(false);
  const [presetSaved, setPresetSaved] = useState<boolean>(false);
  const [jsonCopied, setJsonCopied] = useState<boolean>(false);
  
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
    const data = {
      prompt: suggestionText,
      targetAI,
      exportedAt: new Date().toISOString(),
      generator: "Kollektiv Toolbox"
    };
    
    if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
      (window as any).navigator.clipboard.writeText(JSON.stringify(data, null, 2))
        .then(() => {
          setJsonCopied(true);
          setTimeout(() => setJsonCopied(false), 2000);
        })
        .catch((err: any) => {
          console.error('Failed to copy JSON: ', err);
        });
    }
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
    <div className={`w-full transition-all duration-300 bg-transparent relative overflow-hidden`}>
        
        <div className="p-4 md:p-6 flex flex-col h-full relative">
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
                             <a href={mediaUrl} download={`kollektiv_${targetAI.replace(/\s+/g, '_')}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`} className="form-btn form-btn-primary h-8 px-4 font-black text-[10px] tracking-widest shadow-2xl">
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
                        <p className="text-sm font-medium leading-relaxed text-base-content/80 pl-4 py-2">
                            {suggestionText}
                        </p>
                    </div>

                    {generationError && (
                        <div className="p-2 bg-error/10 border border-error/20 mt-4 animate-fade-in">
                             <p className="text-error font-bold text-[9px] uppercase tracking-widest">{generationError}</p>
                        </div>
                    )}

                    <div className="h-12 flex items-stretch gap-0 mt-4 border-t border-base-300 -mx-4 md:-mx-6 -mb-4 md:-mb-6">
                        <div className="flex flex-1 items-stretch">
                            {isGoogleProduct && !mediaUrl && (
                                <button 
                                    onClick={handleTryGenerate} 
                                    className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-primary uppercase px-1 truncate"
                                >
                                    RENDER
                                </button>
                            )}
                            {onRefine && (
                                 <button onClick={handleRefine} className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase px-1 truncate">
                                    RE-REFINE
                                </button>
                            )}
                            <button
                                onClick={handleCopyJson}
                                className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase px-1 truncate"
                            >
                                {jsonCopied ? 'OK' : 'JSON'}
                            </button>
                        </div>

                        <div className="flex flex-1 items-stretch border-l border-base-300">
                            <button
                                onClick={handleCopy}
                                className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase px-1 truncate"
                            >
                                {copied ? 'OK' : 'COPY'}
                            </button>
                            {onClip && (
                                <button onClick={handleClip} className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase px-1 truncate" disabled={clipped}>
                                    {clipped ? 'OK' : 'CLIP'}
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={saved}
                                className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase px-1 truncate"
                            >
                                {saved ? 'OK' : 'SAVE'}
                            </button>
                            {onSaveAsPreset && (
                                <button
                                    onClick={handleSaveAsPreset}
                                    disabled={presetSaved}
                                    className="form-btn h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-primary uppercase px-1 truncate"
                                >
                                    {presetSaved ? 'OK' : 'PRESET'}
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};
