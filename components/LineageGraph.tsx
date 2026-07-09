import React, { useMemo } from 'react';
import { PromptVersionNode } from '../types';

interface LineageGraphProps {
    lineage: PromptVersionNode[];
    onRestore: (versionId: string) => void;
}

export const LineageGraph: React.FC<LineageGraphProps> = ({ lineage, onRestore }) => {
    // Basic nodes layout for horizontal tree
    const graphNodes = useMemo(() => {
        return lineage.map((node, index) => ({
            ...node,
            level: index,
        }));
    }, [lineage]);

    return (
        <div className="w-full h-48 bg-base-content/5 rounded border border-base-content/5 p-4 overflow-x-auto flex items-center gap-4">
            {graphNodes.map((node) => (
                <div key={node.versionId} className="flex flex-col items-center gap-2 group">
                    <button 
                        onClick={() => onRestore(node.versionId)}
                        className="w-12 h-12 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-[10px] font-mono hover:bg-primary/40 transition-colors"
                        title={node.refinedText.substring(0, 50) + '...'}
                    >
                        {node.versionId}
                    </button>
                    {/* Simple connector line to next */}
                    {node.level < graphNodes.length - 1 && (
                        <div className="w-8 h-px bg-base-content/20" />
                    )}
                </div>
            ))}
        </div>
    );
};
