import React, { useState, useCallback } from 'react';
import { SyntaxHighlighter, vscDarkPlus } from '../codeHighlighter';
import { CopyIcon } from '../icons';

interface MetadataPanelProps {
    fileMetadata: Record<string, any>;
}

const MetadataPanel: React.FC<MetadataPanelProps> = ({ fileMetadata }) => {
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(fileMetadata, null, 2);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [json]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-end p-2 border-b border-base-content/10">
                <button onClick={handleCopy} className="form-btn h-7 px-3 text-2xs flex items-center gap-2">
                    <CopyIcon className="w-3 h-3" /> {copied ? 'COPIED' : 'COPY'}
                </button>
            </div>
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {json}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default MetadataPanel;
