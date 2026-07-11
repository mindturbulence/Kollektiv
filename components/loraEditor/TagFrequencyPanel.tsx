import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TagFilterControls from './TagFilterControls';
import { applyTagFilters } from './lib/tagTools';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface TagFrequencyPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onSettingsChange: (next: LoraEditorSettings) => void;
}

const TagFrequencyPanel: React.FC<TagFrequencyPanelProps> = ({ state, settings, onSettingsChange }) => {
    const filtered = useMemo(() => applyTagFilters(settings.tagByFolder ? state.tagsByFolder : state.tagsAggregated, {
        byFolder: settings.tagByFolder,
        filterMethod: settings.tagFrequencyFilterMethod,
        filter: settings.tagFrequencyFilter,
        excludeFilterMethod: settings.tagExcludeFilterMethod,
        excludeFilter: settings.tagExcludeFilter,
        count: settings.tagFrequencyCount,
    }), [state.tagsByFolder, state.tagsAggregated, settings.tagByFolder, settings.tagFrequencyFilter, settings.tagFrequencyFilterMethod, settings.tagExcludeFilter, settings.tagExcludeFilterMethod, settings.tagFrequencyCount]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TagFilterControls
                values={{
                    count: settings.tagFrequencyCount, filter: settings.tagFrequencyFilter, filterMethod: settings.tagFrequencyFilterMethod,
                    excludeFilter: settings.tagExcludeFilter, excludeFilterMethod: settings.tagExcludeFilterMethod, byFolder: settings.tagByFolder,
                }}
                onChange={(v) => onSettingsChange({
                    ...settings, tagFrequencyCount: v.count, tagFrequencyFilter: v.filter, tagFrequencyFilterMethod: v.filterMethod,
                    tagExcludeFilter: v.excludeFilter, tagExcludeFilterMethod: v.excludeFilterMethod, tagByFolder: v.byFolder,
                })}
            />
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(filtered, null, 2)}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default TagFrequencyPanel;
