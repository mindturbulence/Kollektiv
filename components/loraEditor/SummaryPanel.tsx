import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { replacePlaceholders, resolveField } from './lib/templating';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface SummaryPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ state, settings }) => {
    const fieldContext = useMemo(() => ({
        fileMetadata: state.fileMetadata,
        civitaiMetadata: state.civitaiMetadata,
        arcencielMetadata: state.arcencielMetadata,
        customMetadata: state.customMetadata,
    }), [state]);

    const resolve = (field: string) => resolveField(field, fieldContext, settings.showUndefinedSummaryValues);

    const summaryJson = useMemo(() => {
        const fields = settings.summaryFields.split(',').map(f => f.trim()).filter(Boolean);
        return Object.fromEntries(fields.map(f => [f, resolve(f)]));
    }, [settings.summaryFields, fieldContext, settings.showUndefinedSummaryValues]);

    if (settings.summaryLayout === 'json') {
        return (
            <div className="h-full overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(summaryJson, null, 2)}
                </SyntaxHighlighter>
            </div>
        );
    }

    if (settings.summaryLayout === 'table') {
        return (
            <table className="w-full text-xs font-mono">
                <tbody>
                    {Object.entries(summaryJson).map(([key, value]) => (
                        <tr key={key} className="border-b border-base-content/5">
                            <td className="p-2 opacity-50 whitespace-nowrap align-top">{key}</td>
                            <td className="p-2 break-words" dangerouslySetInnerHTML={{ __html: typeof value === 'object' ? `<pre>${JSON.stringify(value, null, 2)}</pre>` : String(value) }} />
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    // Dashboard layout: renders the user-configured HTML template with {{field}} substitution.
    // Values embedded here may themselves contain HTML produced by custom fields (e.g. civitai_link,
    // civitai_preview) — same self-XSS trust model accepted for the eval-based custom fields.
    const html = replacePlaceholders(settings.customTemplate, resolve, "<span class='opacity-30'>-</span>");
    return <div className="h-full overflow-auto text-xs" dangerouslySetInnerHTML={{ __html: html }} />;
};

export default SummaryPanel;
