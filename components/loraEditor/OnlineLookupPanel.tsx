import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { LoraEditorState } from './LoraEditorPage';

interface OnlineLookupPanelProps {
    state: LoraEditorState;
}

const OnlineLookupPanel: React.FC<OnlineLookupPanelProps> = ({ state }) => {
    const source = state.civitaiMetadata?.modelId ? 'civitai' : (state.arcencielMetadata?.id ? 'arcenciel' : null);
    const data = source === 'civitai' ? state.civitaiMetadata : source === 'arcenciel' ? state.arcencielMetadata : null;

    // Hooks must run unconditionally on every render, so this is computed before the
    // early return below rather than after it (a prior version violated the Rules of
    // Hooks here; harmless under this panel's current mount pattern, but latent).
    const previewUrl = useMemo(() => {
        if (source === 'civitai') return data?.images?.[0]?.url;
        if (source === 'arcenciel') {
            const version = data?.versions?.[0];
            const filePath = version?.images?.[0]?.filePath || version?.videos?.[0]?.filePath;
            return filePath ? `https://arcenciel.io/uploads/${filePath}` : undefined;
        }
        return undefined;
    }, [source, data]);

    if (!source) {
        return <div className="h-full flex items-center justify-center text-xs text-base-content/40 uppercase tracking-widest">No matching resource found</div>;
    }

    const modelUrl = source === 'civitai'
        ? `https://civitai.com/models/${data!.modelId}?modelVersionId=${data!.id}`
        : source === 'arcenciel' ? `https://arcenciel.io/models/${data!.id}` : null;

    const isVideo = previewUrl ? /\.(mp4|webm)$/i.test(previewUrl) : false;

    return (
        <div className="flex flex-col h-full overflow-auto p-4 gap-4">
            <div className="text-[10px] uppercase tracking-widest opacity-40">Source: {source === 'civitai' ? 'CivitAI' : 'Arc En Ciel'}</div>
            <table className="text-xs font-mono">
                <tbody>
                    <tr><td className="opacity-50 pr-4 align-top">Model URL</td><td><a href={modelUrl!} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{modelUrl}</a></td></tr>
                </tbody>
            </table>
            {previewUrl && (
                <div className="max-w-md">
                    {isVideo
                        ? <video src={previewUrl} controls autoPlay muted loop className="w-full" />
                        : <img src={previewUrl} alt="preview" className="w-full" />}
                </div>
            )}
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(data, null, 2)}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default OnlineLookupPanel;
