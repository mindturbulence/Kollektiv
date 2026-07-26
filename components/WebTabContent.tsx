import React, { useState } from 'react';
import type { WebResult } from '../types';
import { audioService } from '../services/audioService';
import { CopyIcon, ArchiveIcon } from './icons';

export const WebResultCard: React.FC<{
    result: WebResult;
    index: number;
    onCopy: (markdown: string) => void;
    onSaveNote: (result: WebResult) => void;
    onSaveVault: (result: WebResult) => void;
}> = ({ result, index, onCopy, onSaveNote, onSaveVault }) => {
    const [expanded, setExpanded] = useState(true);
    const displayNum = String(index + 1).padStart(2, '0');
    const sourceLabel = result.engine || result.source;

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-300/10 relative">
            <div className="flex flex-col w-full h-full p-4 md:p-6">
                <div className="mb-4">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums opacity-20">
                                {displayNum}
                            </span>
                            <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                    {result.source.toUpperCase()} · {sourceLabel}
                                </span>
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight" title={result.title}>
                                    {result.title}
                                </h2>
                                {(result.author || result.published || result.site) && (
                                    <span className="text-[9px] font-bold text-base-content/40 truncate mt-0.5">
                                        {[result.author && `By ${result.author}`, result.published, result.site].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            <button
                                onClick={() => onCopy(result.markdown)}
                                className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn px-2 py-1 text-[9px] font-black"
                                title="Copy markdown"
                            >
                                <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                                COPY
                            </button>
                            <button
                                onClick={() => onSaveNote(result)}
                                className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn px-2 py-1 text-[9px] font-black"
                                title="Save as note"
                            >
                                <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                                NOTE
                            </button>
                            <button
                                onClick={() => onSaveVault(result)}
                                className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn px-2 py-1 text-[9px] font-black"
                                title="Save to vault"
                            >
                                <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                                VAULT
                            </button>
                            <button
                                onClick={() => { audioService.playClick(); setExpanded(!expanded); }}
                                className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 transition-colors btn-snake"
                                aria-label={expanded ? 'Collapse' : 'Expand'}
                            >
                                <span/><span/><span/><span/>
                                {expanded ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7 7 7-7" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {expanded && (
                        <>
                            {result.image && (
                                <img
                                    src={result.image}
                                    alt=""
                                    loading="lazy"
                                    className="w-full max-h-64 object-cover border border-base-300/20 mb-3"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-[14px] leading-relaxed">
                                {result.markdown}
                            </div>
                        </>
                    )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>
    );
};
