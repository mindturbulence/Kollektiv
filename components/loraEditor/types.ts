export interface CustomFieldDef {
    label: string;
    calc: string;
    showError?: boolean;
}

export type FilterMethod = 'none' | 'partial' | 'exact' | 'regex';
export type LookupSource = '' | 'civ' | 'aec';

export interface LoraEditorSettings {
    summaryFields: string;
    editorFields: string;
    showUndefinedSummaryValues: boolean;
    summaryLayout: 'json' | 'table' | 'custom';
    customFields: CustomFieldDef[];
    customTemplate: string;

    primaryLookup: LookupSource;
    secondaryLookup: LookupSource;
    enableProxy: boolean;
    proxyUrl: string;

    tagFrequencyCount: number;
    tagFrequencyFilter: string;
    tagFrequencyFilterMethod: FilterMethod;
    tagExcludeFilter: string;
    tagExcludeFilterMethod: FilterMethod;
    tagByFolder: boolean;

    suggestedPromptCount: number;
    suggestedPromptFilter: string;
    suggestedPromptFilterMethod: FilterMethod;
    suggestedPromptExcludeFilter: string;
    suggestedPromptExcludeFilterMethod: FilterMethod;
    suggestedPromptByFolder: boolean;
}

export interface FileHashes {
    sha256?: string;
    autov2?: string;
    sha256_autov3?: string;
    autov3?: string;
}

export interface CustomFieldContext {
    fileMetadata: Record<string, any>;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    basemodelMetadata: Record<string, any>;
    vaeMetadata: Record<string, any>;
    safetensorsFile: File | null;
}

export interface LookupResult {
    data: any;
    hash: string;
    modelUrl: string;
    resourceUrl: string;
    source: 'CivitAI' | 'Arc En Ciel';
}
