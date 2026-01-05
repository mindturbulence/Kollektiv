
import React, { useState, useCallback, useMemo } from 'react';
import { DownloadIcon, SparklesIcon, PhotoIcon, FilmIcon } from './icons';
import { generateWithImagen, generateWithNanoBanana, generateWithVeo } from '../services/llmService';

interface SuggestionItemProps {
  suggestionText: string;
  targetAI?: string;
  onSave: (suggestionText: string) => void;
  onRefine?: (suggestionText: string) => void;
  onClip?: (suggestionText: string) => void;
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ 
    suggestionText, 
    targetAI = '', 
    onSave, 
    onRefine, 
    onClip 
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
            setLoadingMsg('Simulating snapshot...');
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
    <div className={`card bg-base-200 shadow-xl rounded-xl transition-all duration-500 ${isGenerating ? 'animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-base-100' : ''}`}>
        <div className="card-body p-4">
            {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <span className="loading loading-spinner loading-lg text-primary"></span>
                    <div className="space-y-1">
                        <p className="font-bold text-sm uppercase tracking-widest text-primary animate-bounce">{loadingMsg}</p>
                        <p className="text-xs text-base-content/50 italic px-4">Wait a moment, Google AI is crafting your creation...</p>
                    </div>
                </div>
            ) : mediaUrl ? (
                <div className="space-y-4">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video sm:aspect-square flex items-center justify-center group">
                        {isVideo ? (
                            <video src={mediaUrl} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : (
                            <img src={mediaUrl} alt="Generated result" className="w-full h-full object-contain" />
                        )}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <a href={mediaUrl} download={`kollektiv_${targetAI.replace(/\s+/g, '_')}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`} className="btn btn-xs btn-primary">
                                <DownloadIcon className="w-3 h-3 mr-1"/> Download
                            </a>
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                         <span className="badge badge-primary badge-outline font-bold">{targetAI} Result</span>
                         <button onClick={() => setMediaUrl(null)} className="btn btn-link btn-xs no-underline">View Text Prompt</button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-base-content/90 text-sm flex-grow">{suggestionText}</p>
                    {generationError && (
                        <div className="alert alert-error text-[10px] p-2 mt-2">
                             <span>{generationError}</span>
                        </div>
                    )}
                    <div className="card-actions justify-end mt-2">
                        {isGoogleProduct && !mediaUrl && (
                            <button 
                                onClick={handleTryGenerate} 
                                className="btn btn-sm btn-primary gap-1"
                                title={`Generate with ${targetAI}`}
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Try Generate
                            </button>
                        )}
                        {onClip && (
                            <button onClick={handleClip} className="btn btn-sm btn-ghost" disabled={clipped}>
                                {clipped ? 'Clipped' : 'Clip'}
                            </button>
                        )}
                        {onRefine && (
                             <button onClick={handleRefine} className="btn btn-sm btn-ghost">
                                Refine
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saved}
                            className="btn btn-sm btn-ghost"
                            title={saved ? "Saved to Library" : "Save to Library"}
                        >
                            {saved ? 'Saved' : 'Save'}
                        </button>
                        <button
                            onClick={handleDownloadJson}
                            className="btn btn-sm btn-ghost gap-1"
                            title="Download raw JSON"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            JSON
                        </button>
                        <button
                            onClick={handleCopy}
                            className="btn btn-sm btn-ghost"
                            title={copied ? "Copied!" : "Copy prompt"}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};
