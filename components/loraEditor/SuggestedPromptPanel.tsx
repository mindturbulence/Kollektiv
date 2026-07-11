import React, { useMemo } from 'react';
import TagFilterControls from './TagFilterControls';
import { applyTagFilters, getSuggestedPrompt } from './lib/tagTools';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface SuggestedPromptPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onSettingsChange: (next: LoraEditorSettings) => void;
}

const SuggestedPromptPanel: React.FC<SuggestedPromptPanelProps> = ({ state, settings, onSettingsChange }) => {
    const prompt = useMemo(() => {
        const filtered = applyTagFilters(settings.suggestedPromptByFolder ? state.tagsByFolder : state.tagsAggregated, {
            byFolder: settings.suggestedPromptByFolder,
            filterMethod: settings.suggestedPromptFilterMethod,
            filter: settings.suggestedPromptFilter,
            excludeFilterMethod: settings.suggestedPromptExcludeFilterMethod,
            excludeFilter: settings.suggestedPromptExcludeFilter,
            count: settings.suggestedPromptCount,
        });
        const built = getSuggestedPrompt(filtered);
        if (!settings.suggestedPromptByFolder && built) return { Prompt: built.Prompt };
        return built || {};
    }, [state.tagsByFolder, state.tagsAggregated, settings.suggestedPromptByFolder, settings.suggestedPromptFilter, settings.suggestedPromptFilterMethod, settings.suggestedPromptExcludeFilter, settings.suggestedPromptExcludeFilterMethod, settings.suggestedPromptCount]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TagFilterControls
                values={{
                    count: settings.suggestedPromptCount, filter: settings.suggestedPromptFilter, filterMethod: settings.suggestedPromptFilterMethod,
                    excludeFilter: settings.suggestedPromptExcludeFilter, excludeFilterMethod: settings.suggestedPromptExcludeFilterMethod, byFolder: settings.suggestedPromptByFolder,
                }}
                onChange={(v) => onSettingsChange({
                    ...settings, suggestedPromptCount: v.count, suggestedPromptFilter: v.filter, suggestedPromptFilterMethod: v.filterMethod,
                    suggestedPromptExcludeFilter: v.excludeFilter, suggestedPromptExcludeFilterMethod: v.excludeFilterMethod, suggestedPromptByFolder: v.byFolder,
                })}
            />
            <div className="flex-grow overflow-auto p-4">
                <table className="w-full text-xs font-mono">
                    <tbody>
                        {Object.entries(prompt).map(([key, value]) => (
                            <tr key={key} className="border-b border-base-content/5">
                                <td className="p-2 opacity-50 whitespace-nowrap align-top">{key}</td>
                                <td className="p-2 break-words cursor-pointer hover:text-primary" onClick={() => navigator.clipboard.writeText(String(value))} title="Click to copy">{String(value)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SuggestedPromptPanel;
