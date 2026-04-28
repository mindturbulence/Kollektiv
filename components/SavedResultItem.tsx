import React, { useState } from 'react';

import { CopyIcon, ArchiveIcon, DeleteIcon, RefreshIcon } from './icons';

interface SavedResultItemProps {
    text: string;
    onCopy: (text: string) => void;
    onSaveToLibrary: (text: string) => void;
    onDelete: () => void;
    onRefine?: (text: string) => void;
}

const SavedResultItem: React.FC<SavedResultItemProps> = ({ text, onCopy, onSaveToLibrary, onDelete, onRefine }) => {
    const [copied, setCopied] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        onCopy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSaveToLibrary(text);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
    };

    const handleRefine = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onRefine) onRefine(text);
    };

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-300/10 relative">
            <div className="flex flex-col w-full h-full p-4 md:p-6">
                {/* Header Section */}
                <div className="mb-4">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 min-w-0">
                            <ArchiveIcon className="w-5 h-5 text-primary opacity-30 flex-shrink-0" />
                            <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                    SAVED RESULT
                                </span>
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight">
                                    LOCAL ARCHIVE
                                </h2>
                            </div>
                        </div>
                        <button
                            onClick={handleDelete}
                            className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 -content/20 hover:text-error transition-colors btn-snake ml-4"
                            title="Delete record"
                        >
                            <span/><span/><span/><span/>
                            <DeleteIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-grow mb-4">
                    <p className="text-sm font-medium leading-relaxed text-base-content/70 italic line-clamp-3" title={text}>
                        "{text}"
                    </p>
                </div>

                {/* Footer Section - Actions */}
                <div className="flex justify-between items-center mt-2 pt-4 border-t border-base-300/10">
                    <button
                        onClick={handleCopy}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                    <button
                        onClick={handleRefine}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <RefreshIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        REFINE
                    </button>
                    <button
                        onClick={handleSave}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {saved ? 'SAVED' : 'LIBRARY'}
                    </button>
                </div>
            </div>
            {/* Decorative Line (Frameline style) */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

export default SavedResultItem;
