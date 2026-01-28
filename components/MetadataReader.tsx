import React, { useState, useRef, useCallback, useMemo } from 'react';
import { extractFullMetadata, type ParsedMetadata } from '../utils/fileUtils';
import { UploadIcon, PhotoIcon, CloseIcon, SparklesIcon, BookmarkIcon, ArchiveIcon, DownloadIcon, CheckIcon, BracesIcon } from './icons';
import CopyIcon from './CopyIcon';
import LoadingSpinner from './LoadingSpinner';

interface MetadataReaderProps {
  onSendToRefiner: (text: string) => void;
  onClipIdea: (text: string, title: string) => void;
  onSaveToLibrary: (text: string, title: string) => void;
  header: React.ReactNode;
}

const FieldRow: React.FC<{ label: string, value: string, onCopy?: () => void }> = ({ label, value, onCopy }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.();
    };

    if (!value) return null;

    return (
        <div className="group/field relative border-b border-base-300/30 pb-4 last:border-0">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/30">{label}</span>
                <button 
                    onClick={handleCopy} 
                    className="btn btn-xs btn-ghost opacity-0 group-hover/field:opacity-100 transition-opacity font-black text-[8px] tracking-widest uppercase"
                >
                    {copied ? 'OK' : 'COPY'}
                </button>
            </div>
            <p className="text-base font-medium leading-relaxed text-base-content/80 break-words font-mono bg-base-200/20 p-3 border border-base-300/50">
                {value}
            </p>
        </div>
    );
};

export const MetadataReader: React.FC<MetadataReaderProps> = ({ 
    onSendToRefiner, 
    onClipIdea, 
    onSaveToLibrary,
    header 
}) => {
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [metadata, setMetadata] = useState<ParsedMetadata | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedRaw, setCopiedRaw] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = async (file: File | null) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('UNSUPPORTED FORMAT. PNG/JPG ONLY.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setMetadata(null);
        setSourceFile(file);
        
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));

        try {
            const result = await extractFullMetadata(file);
            if (result) {
                setMetadata(result);
            } else {
                setError("NO DATA DETECTED.");
            }
        } catch (err) {
            setError("EXTRACTION FAILED.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveMedia = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSourceFile(null);
        setPreviewUrl(null);
        setMetadata(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSaveWorkflow = () => {
        if (!metadata?.workflow) return;
        const blob = new Blob([metadata.workflow], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow_${sourceFile?.name.replace(/\.[^/.]+$/, "") || Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyRaw = () => {
        const textToCopy = metadata?.raw || metadata?.workflow || '';
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy);
        setCopiedRaw(true);
        setTimeout(() => setCopiedRaw(false), 2000);
    };

    const filteredParams = useMemo(() => {
        if (!metadata?.params) return [];
        return Object.entries(metadata.params).filter(([key]) => {
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
    }, [metadata]);

    const hasPrompt = !!metadata?.prompt && !metadata.prompt.includes('extraction failed') && !metadata.prompt.includes('No text nodes');

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 overflow-hidden h-full bg-base-100">
            <div className="lg:col-span-1 bg-base-100 flex flex-col min-h-0 border-r border-base-300">
                {header}
                <header className="p-6 border-b border-base-300 bg-base-200/10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Source Image</h3>
                </header>
                <div className="p-6 flex flex-col gap-6 flex-grow min-h-0 overflow-hidden">
                    <div 
                        className={`relative flex-grow w-full border-2 border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-colors group overflow-hidden ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}`}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]); }}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onClick={() => !previewUrl && (fileInputRef.current as any)?.click()}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={(e) => handleFileSelect((e.currentTarget as any).files?.[0] || null)} 
                            className="hidden" 
                            accept="image/*"
                        />
                        
                        {!previewUrl ? (
                            <div className="text-center opacity-20 transition-opacity group-hover:opacity-40 p-12">
                                <PhotoIcon className="w-16 h-16 mx-auto mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest">LOAD SOURCE</p>
                                <p className="text-[9px] font-bold text-base-content/20 mt-2 uppercase">PNG / JPG WITH DATA</p>
                            </div>
                        ) : (
                            <div className="w-full h-full relative bg-black" onClick={e => e.stopPropagation()}>
                                <img 
                                    src={previewUrl} 
                                    className="w-full h-full object-cover" 
                                    alt="Source" 
                                />
                                <button onClick={handleRemoveMedia} className="btn btn-xs btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 shadow-2xl z-10 rounded-none">
                                    <CloseIcon className="w-3 h-3"/>
                                </button>
                            </div>
                        )}
                    </div>
                    {metadata?.workflow && (
                        <div className="space-y-2 animate-fade-in">
                            <div className="badge badge-secondary rounded-none font-black text-[9px] tracking-widest w-full py-3 mb-2 uppercase">GRAPH DATA FOUND</div>
                            <button 
                                onClick={handleSaveWorkflow}
                                className="btn btn-sm btn-outline btn-secondary rounded-none font-black text-[10px] tracking-widest uppercase w-full"
                            >
                                <DownloadIcon className="w-4 h-4 mr-2" />
                                EXPORT JSON
                            </button>
                        </div>
                    )}
                </div>
                <footer className="p-4 border-t border-base-300 bg-base-200/20">
                    <button onClick={() => handleRemoveMedia(null as any)} disabled={!previewUrl || isLoading} className="btn btn-sm btn-ghost w-full rounded-none font-black text-[9px] tracking-widest text-error/40 hover:text-error uppercase">PURGE BUFFER</button>
                </footer>
            </div>

            <div className="lg:col-span-2 bg-base-100 flex flex-col min-h-0">
                <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> METADATA STREAM
                    </h2>
                </header>
                
                <div className="flex-grow p-8 overflow-y-auto custom-scrollbar bg-base-200/5 flex flex-col">
                    {isLoading ? (
                        <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6">
                            <LoadingSpinner />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse uppercase">Scanning...</p>
                        </div>
                    ) : error ? (
                        <div className="p-8">
                            <div className="alert alert-error rounded-none border-2">
                                <span className="font-black uppercase text-[10px] tracking-widest">{error}</span>
                            </div>
                        </div>
                    ) : metadata ? (
                        <div className="space-y-10 animate-fade-in">
                            <section className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/40">IDENTIFIED ARTIFACTS</h4>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => onSendToRefiner(metadata.prompt)}
                                            disabled={!hasPrompt}
                                            className="btn btn-sm btn-ghost border border-base-300 rounded-none text-primary font-black text-[9px] tracking-widest uppercase"
                                        >
                                            <SparklesIcon className="w-3.5 h-3.5 mr-1.5 opacity-40"/>
                                            REFINE
                                        </button>
                                        <button 
                                            onClick={() => onClipIdea(metadata.prompt, `Info: ${sourceFile?.name}`)}
                                            disabled={!hasPrompt}
                                            className="btn btn-sm btn-ghost border border-base-300 rounded-none font-black text-[9px] tracking-widest uppercase"
                                        >
                                            <BookmarkIcon className="w-3.5 h-3.5 mr-1.5 opacity-40"/>
                                            CLIP
                                        </button>
                                        <button 
                                            onClick={() => onSaveToLibrary(metadata.prompt, `Saved: ${sourceFile?.name}`)}
                                            disabled={!hasPrompt}
                                            className="btn btn-sm btn-primary rounded-none font-black text-[9px] tracking-widest shadow-lg uppercase"
                                        >
                                            <ArchiveIcon className="w-3.5 h-3.5 mr-1.5"/>
                                            SAVE
                                        </button>
                                    </div>
                                </div>
                                <FieldRow label="Positive Prompt" value={hasPrompt ? metadata.prompt : (metadata.workflow ? 'GRAPH FOUND. USE EXPORT BUTTON.' : 'NO READABLE DATA.')} />
                                <FieldRow label="Negative Prompt" value={metadata.negativePrompt} />
                            </section>

                            {filteredParams.length > 0 && (
                                <section className="space-y-6 pt-8 border-t border-base-300">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/40">TECH SPECIFICATIONS</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
                                        {filteredParams.map(([key, val]) => (
                                            <div key={key} className="flex flex-col border-b border-base-300/30 pb-3">
                                                <span className="text-[9px] font-black uppercase text-base-content/20 tracking-widest mb-1 truncate" title={key}>{key}</span>
                                                <span className="text-base font-mono font-bold text-base-content/60 break-words">{val}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="space-y-4 pt-8 border-t border-base-300">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-base-content/20">RAW STREAM</h4>
                                    </div>
                                    <button 
                                        onClick={handleCopyRaw}
                                        disabled={!metadata.raw && !metadata.workflow}
                                        className="btn btn-sm btn-ghost border border-base-300 rounded-none font-black text-[9px] tracking-widest uppercase"
                                    >
                                        {copiedRaw ? <><CheckIcon className="w-3 h-3 mr-1.5 text-success"/> OK</> : <><BracesIcon className="w-3.5 h-3.5 mr-1.5 opacity-40"/> COPY RAW</>}
                                    </button>
                                </div>
                                <div className="p-4 bg-black/5 border border-base-300 text-[10px] font-mono text-base-content/30 break-words leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                                    {metadata.raw || (metadata.workflow ? 'WORKFLOW DATA ARCHIVED.' : 'EMPTY STREAM.')}
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-10">
                            <ArchiveIcon className="w-24 h-24 mb-6" />
                            <p className="text-xl font-black uppercase tracking-widest">AWAITING SOURCE INPUT</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
