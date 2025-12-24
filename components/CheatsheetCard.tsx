
import React, { useState, useCallback } from 'react';
import type { CheatsheetItem } from '../types';
import CopyIcon from './CopyIcon';
import { CheckIcon } from './icons';

interface CheatsheetCardProps {
  item: CheatsheetItem;
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
            className="btn btn-sm btn-ghost btn-square"
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
            className="bg-base-300 text-base-content text-xs font-mono py-1 pl-2 pr-1 rounded-md hover:bg-primary hover:text-primary-content transition-colors flex items-center gap-1.5"
        >
            {keyword}
            {copied ? <CheckIcon className="w-3 h-3 text-success-content ml-1" /> : null}
        </button>
    );
};


const CheatsheetCard: React.FC<CheatsheetCardProps> = ({ item }) => {
  return (
    <article className="space-y-4 flex flex-col">
        <h3 className="text-xl font-semibold text-primary">{item.name}</h3>
        {item.description && <p className="text-base-content/80 text-base">{item.description}</p>}

        {item.example && (
            <div className="mt-auto">
            <p className="text-xs font-semibold text-base-content/60 mb-1 uppercase">Example</p>
            <div className="bg-base-200 p-2 rounded-md flex justify-between items-start gap-2">
                <pre className="text-sm text-base-content whitespace-pre-wrap font-mono my-auto"><code>{item.example}</code></pre>
                <CopyButton text={item.example} />
            </div>
            </div>
        )}

        {item.keywords && item.keywords.length > 0 && (
            <div className="mt-auto">
            <p className="text-xs font-semibold text-base-content/60 mb-2 uppercase">Keywords</p>
            <div className="flex flex-wrap gap-2">
                {item.keywords.map(keyword => (
                <KeywordTag key={keyword} keyword={keyword} />
                ))}
            </div>
            </div>
        )}
    </article>
  );
};

export default CheatsheetCard;
