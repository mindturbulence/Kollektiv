import React, { useState, useCallback } from 'react';

interface SuggestionItemProps {
  suggestionText: string;
  onSave: (suggestionText: string) => void;
  onRefine?: (suggestionText: string) => void;
  onClip?: (suggestionText: string) => void;
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ suggestionText, onSave, onRefine, onClip }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [clipped, setClipped] = useState<boolean>(false);

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

  return (
    <div className="card bg-base-200 shadow-xl rounded-xl">
        <div className="card-body p-4">
            <p className="text-base-content/90 text-sm flex-grow">{suggestionText}</p>
            <div className="card-actions justify-end mt-2">
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
                    onClick={handleCopy}
                    className="btn btn-sm btn-ghost"
                    title={copied ? "Copied!" : "Copy prompt"}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    </div>
  );
};