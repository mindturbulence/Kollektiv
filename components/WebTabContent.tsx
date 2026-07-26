import React, { useState } from 'react';
import type { WebResult } from '../types';
import { audioService } from '../services/audioService';
import { DeleteIcon } from './icons';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Remove HTML tags from a string — keeps the text content between tags. */
export function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '');
}

export const WebResultCard: React.FC<{
    result: WebResult;
    onDelete?: (result: WebResult) => void;
}> = ({ result, onDelete }) => {
    const [expanded, setExpanded] = useState(true);
    const sourceLabel = result.engine || result.source;

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-300/10 relative">
            <div className="flex flex-col w-full h-full p-4 md:p-6">
                <div className="mb-4">
                    <div className="flex flex-col mb-2">
                        <span className="text-sm font-black uppercase tracking-[0.3em] text-primary/60 mb-0.5 leading-none">
                            {result.source.toUpperCase()} · {sourceLabel}
                        </span>
                        <h2 className="font-black text-sm text-base-content uppercase tracking-tight font-logo leading-tight w-full" title={result.title}>
                            {result.title}
                        </h2>
                        {(result.author || result.published || result.site) && (
                            <span className="text-xs font-semibold text-base-content/50 truncate mt-1">
                                {[result.author && `By ${result.author}`, result.published, result.site].filter(Boolean).join(' · ')}
                            </span>
                        )}
                        <div className="flex justify-end gap-1 -mt-8">
                            <button
                                onClick={() => { audioService.playClick(); onDelete?.(result); }}
                                className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                title="Remove result"
                            >
                                <span/><span/><span/><span/>
                                <DeleteIcon className="w-4 h-4" />
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
                            <div className="prose prose-sm prose-invert max-w-none text-[14px] leading-relaxed">
                                <Markdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />
                                    }}
                                >{result.markdown}</Markdown>
                            </div>
                        </>
                    )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>
    );
};
