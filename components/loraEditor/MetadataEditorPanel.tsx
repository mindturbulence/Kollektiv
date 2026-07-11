import React, { useState, useEffect, useCallback } from 'react';
import { buildDownloadBlob, downloadFilename } from './lib/safetensors';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface MetadataEditorPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onFeedback: (message: string, isError?: boolean) => void;
}

const MetadataEditorPanel: React.FC<MetadataEditorPanelProps> = ({ state, settings, onFeedback }) => {
    const [format, setFormat] = useState<'manual' | 'simple'>('manual');
    const [editorText, setEditorText] = useState('');

    useEffect(() => {
        setEditorText(JSON.stringify(state.rawMetadataStrings, null, 2));
    }, [state.file]);

    const editorFields = settings.editorFields.split(',').map(f => f.trim()).filter(Boolean);

    const parseEditorText = useCallback((): Record<string, string> | null => {
        try {
            const parsed = JSON.parse(editorText || '{}');
            for (const key of ['ss_dataset_dirs', 'ss_bucket_info', 'ss_tag_frequency']) {
                if (parsed[key] !== undefined) JSON.parse(parsed[key]);
            }
            return parsed;
        } catch (e) {
            onFeedback(`Error parsing edited metadata. Ensure it is valid JSON (and that ss_dataset_dirs/ss_bucket_info/ss_tag_frequency are valid JSON strings).`, true);
            return null;
        }
    }, [editorText, onFeedback]);

    const handleSimpleFieldChange = (field: string, value: string) => {
        const parsed = JSON.parse(editorText || '{}');
        parsed[field] = value;
        setEditorText(JSON.stringify(parsed, null, 2));
    };

    const triggerDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownload = async (purge: boolean) => {
        if (!state.file) return;
        try {
            const newMetadata = purge ? null : parseEditorText();
            if (!purge && newMetadata === null) return;
            const blob = await buildDownloadBlob(state.file, newMetadata);
            triggerDownload(blob, downloadFilename(state.file.name, purge));
            onFeedback(`Metadata ${purge ? 'purged' : 'updated'} successfully!`);
        } catch (e) {
            onFeedback(`An error occurred while writing the file: ${e instanceof Error ? e.message : String(e)}`, true);
        }
    };

    let simpleValues: Record<string, string> = {};
    try { simpleValues = JSON.parse(editorText || '{}'); } catch { /* left empty; manual view still shows the raw invalid text */ }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-base-content/10">
                <select value={format} onChange={(e) => setFormat(e.target.value as 'manual' | 'simple')} className="form-select h-7 text-[10px]">
                    <option value="manual">Manual</option>
                    <option value="simple">Simple</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={() => handleDownload(false)} className="form-btn h-7 px-3 text-[10px]">UPDATE &amp; DOWNLOAD</button>
                    <button onClick={() => handleDownload(true)} className="form-btn h-7 px-3 text-[10px] text-error/70 hover:text-error">PURGE &amp; DOWNLOAD</button>
                </div>
            </div>
            <div className="flex-grow overflow-auto p-2">
                {format === 'manual' ? (
                    <textarea value={editorText} onChange={(e) => setEditorText(e.target.value)} className="form-textarea w-full h-full font-mono text-[11px]" spellCheck={false} />
                ) : (
                    <table className="w-full text-xs font-mono">
                        <tbody>
                            {editorFields.map((field) => (
                                <tr key={field}>
                                    <td className="p-2 opacity-50 whitespace-nowrap align-top">{field}</td>
                                    <td className="p-2"><input value={simpleValues[field] ?? ''} onChange={(e) => handleSimpleFieldChange(field, e.target.value)} className="form-input w-full" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default MetadataEditorPanel;
