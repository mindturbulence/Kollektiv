
import React, { useState, useCallback } from 'react';
import type { CheatsheetItem } from '../types';
import CopyIcon from './CopyIcon';
import { CheckIcon } from './icons';

interface CheatsheetCardProps {
  item: CheatsheetItem;
  onInject: (item: CheatsheetItem) => void;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }, [text]);

    return (
        <button
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy"}
            className="btn btn-xs btn-ghost btn-square"
        >
            {copied ? <CheckIcon className="w-4 h-4 text-success" /> : <CopyIcon className="w-4 h-4" />}
        </button>
    );
};

const KeywordTag: React.FC<{ keyword: string }> = ({ keyword }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(keyword).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }, [keyword]);

    return (
        <button
            onClick={handleCopy}
            title={copied ? "Copied!" : `Copy "${keyword}"`}
            className="bg-base-300 text-base-content text-[10px] font-black uppercase tracking-widest py-1.5 pl-3 pr-2 rounded-none hover:bg-primary hover:text-primary-content transition-all flex items-center gap-2"
        >
            {keyword}
            {copied ? <CheckIcon className="w-3 h-3 text-success-content" /> : null}
        </button>
    );
};


const CheatsheetCard: React.FC<CheatsheetCardProps> = ({ item }) => {
  return (
    <div className="p-8 md:p-12 space-y-6 flex flex-col h-full bg-base-100 group transition-all duration-500 hover:bg-base-200/50 border-b border-base-300 last:border-0">
        <div className="space-y-2">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/60">CONCEPT_NODE</span>
            <h3 className="text-3xl font-black tracking-tighter text-base-content uppercase leading-none group-hover:text-primary transition-colors">
                {item.name}
            </h3>
        </div>

        {item.description && (
            <p className="text-lg font-medium leading-relaxed text-base-content/70 italic">
                "{item.description}"
            </p>
        )}

        {item.example && (
            <div className="bg-base-200/50 border border-base-300 p-6 rounded-none relative">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/30">Execution Sample</span>
                    <CopyButton text={item.example} />
                </div>
                <code className="text-sm text-base-content/80 font-medium leading-relaxed block pr-8">
                    {item.example}
                </code>
            </div>
        )}

        {item.keywords && item.keywords.length > 0 && (
            <div className="pt-4 flex flex-wrap gap-2">
                {item.keywords.map(keyword => (
                    <KeywordTag key={keyword} keyword={keyword} />
                ))}
            </div>
        )}
    </div>
  );
};

export default CheatsheetCard;
