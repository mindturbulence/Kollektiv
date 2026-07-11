import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, panelVariants, sectionWipeVariants, TerminalText } from '../AnimatedPanels';
import { UploadIcon } from '../icons';
import useLocalStorage from '../../utils/useLocalStorage';
import { parseHeader } from './lib/safetensors';
import { calculateFileHashes } from './lib/hashing';
import { evaluateCustomFields } from './lib/customFields';
import { getModelDataByHash } from './lib/onlineLookup';
import { aggregateAndSort, sortSubproperties, convertNumericKeysToString } from './lib/tagTools';
import { DEFAULT_SETTINGS } from './constants';
import type { LoraEditorSettings, FileHashes } from './types';

export type LoraEditorTab = 'summary' | 'tags' | 'metadata' | 'editor' | 'lookup';

export interface LoraEditorState {
    file: File | null;
    fileMetadata: Record<string, any>;
    rawMetadataStrings: Record<string, string>;
    hashes: FileHashes;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    basemodelMetadata: Record<string, any>;
    vaeMetadata: Record<string, any>;
    customMetadata: Record<string, any>;
    tagsByFolder: Record<string, Record<string, number>>;
    tagsAggregated: Record<string, number>;
}

const EMPTY_STATE: LoraEditorState = {
    file: null,
    fileMetadata: {},
    rawMetadataStrings: {},
    hashes: {},
    civitaiMetadata: {},
    arcencielMetadata: {},
    basemodelMetadata: {},
    vaeMetadata: {},
    customMetadata: {},
    tagsByFolder: {},
    tagsAggregated: {},
};

interface LoraEditorPageProps {
    isExiting?: boolean;
}

const LoraEditorPage: React.FC<LoraEditorPageProps> = ({ isExiting = false }) => {
    const [settings, setSettings] = useLocalStorage<LoraEditorSettings>('loraEditorSettings', DEFAULT_SETTINGS);
    const [state, setState] = useState<LoraEditorState>(EMPTY_STATE);
    const [activeTab, setActiveTab] = useState<LoraEditorTab>('summary');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    void isSettingsOpen; // ponytail: read by Task 16's settings modal, not rendered yet
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const recomputeCustomMetadata = useCallback((partial: Partial<LoraEditorState>, currentSettings: LoraEditorSettings) => {
        // Seed customMetadata with the hashes computed in Task 4's lib/hashing.ts — these aren't
        // produced by any calc expression, but several default custom fields (e.g. arcenciel_version_index)
        // read customMetadata.sha256/.sha256_autov3, mirroring the original tool where calculateFileHashes()
        // writes hashes directly into the same customMetadata object the eval expressions read from.
        const seed = {
            sha256: partial.hashes?.sha256,
            autov2: partial.hashes?.autov2,
            sha256_autov3: partial.hashes?.sha256_autov3,
            autov3: partial.hashes?.autov3,
        };
        return evaluateCustomFields(currentSettings.customFields, {
            fileMetadata: partial.fileMetadata || {},
            civitaiMetadata: partial.civitaiMetadata || {},
            arcencielMetadata: partial.arcencielMetadata || {},
            basemodelMetadata: partial.basemodelMetadata || {},
            vaeMetadata: partial.vaeMetadata || {},
            safetensorsFile: partial.file ?? null,
        }, seed);
    }, []);

    const runLookups = useCallback(async (base: LoraEditorState, currentSettings: LoraEditorSettings) => {
        if (!currentSettings.primaryLookup) return base;
        setLoadingMessage('Looking up model...');

        const proxyUrl = currentSettings.enableProxy ? currentSettings.proxyUrl : null;
        const civAutov2 = base.hashes.autov2;
        const civAutov3 = base.hashes.autov3;
        const sha256 = base.hashes.sha256;
        const sha256Autov3 = base.hashes.sha256_autov3;

        // Primary/secondary resource lookup: CivitAI keys on AutoV2/AutoV3 short hashes,
        // Arc en Ciel keys on full SHA-256. Try both hash forms per the original tool.
        const primaryHash = currentSettings.primaryLookup === 'civ' ? (civAutov2 || civAutov3) : (sha256 || sha256Autov3);
        let lookupResult = primaryHash ? await getModelDataByHash(primaryHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl) : null;

        let civitaiMetadata = base.civitaiMetadata;
        let arcencielMetadata = base.arcencielMetadata;
        if (lookupResult?.source === 'CivitAI') civitaiMetadata = lookupResult.data;
        else if (lookupResult?.source === 'Arc En Ciel') arcencielMetadata = lookupResult.data;

        let basemodelMetadata = base.basemodelMetadata;
        let vaeMetadata = base.vaeMetadata;
        const baseModelHash = base.fileMetadata.ss_new_sd_model_hash || base.fileMetadata.ss_sd_model_hash;
        if (baseModelHash) {
            setLoadingMessage('Looking up base model...');
            const baseInfo = await getModelDataByHash(baseModelHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl);
            if (baseInfo) basemodelMetadata = baseInfo.data;
        }
        const vaeHash = base.fileMetadata.ss_new_vae_hash || base.fileMetadata.ss_vae_hash;
        if (vaeHash) {
            setLoadingMessage('Looking up VAE...');
            const vaeInfo = await getModelDataByHash(vaeHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl);
            if (vaeInfo) vaeMetadata = vaeInfo.data;
        }

        const next: LoraEditorState = { ...base, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata };
        next.customMetadata = { ...next.customMetadata, ...recomputeCustomMetadata(next, currentSettings) };
        return next;
    }, [recomputeCustomMetadata]);

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files);
        const file = list.find(f => f.name.endsWith('.safetensors') || f.name.endsWith('.gguf'));
        if (!file) return;

        setIsLoading(true);
        setState(EMPTY_STATE);

        try {
            let fileMetadata: Record<string, any> = {};
            let rawMetadataStrings: Record<string, string> = {};
            if (file.name.endsWith('.safetensors')) {
                setLoadingMessage('Parsing metadata...');
                const parsed = await parseHeader(file);
                fileMetadata = parsed.fileMetadata;
                rawMetadataStrings = parsed.rawMetadataStrings;
            }

            setLoadingMessage('Calculating hashes...');
            const hashes = await calculateFileHashes(file, undefined, (msg) => setLoadingMessage(msg));

            let tagsByFolder: Record<string, Record<string, number>> = {};
            let tagsAggregated: Record<string, number> = {};
            if (fileMetadata['ss_tag_frequency']) {
                const normalized = convertNumericKeysToString(fileMetadata['ss_tag_frequency']);
                tagsByFolder = sortSubproperties(normalized);
                tagsAggregated = aggregateAndSort(normalized);
            }

            let next: LoraEditorState = {
                file, fileMetadata, rawMetadataStrings, hashes,
                civitaiMetadata: {}, arcencielMetadata: {}, basemodelMetadata: {}, vaeMetadata: {},
                customMetadata: {}, tagsByFolder, tagsAggregated,
            };
            next.customMetadata = recomputeCustomMetadata(next, settings);

            next = await runLookups(next, settings);

            setState(next);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [settings, recomputeCustomMetadata, runLookups]);

    const handleReset = useCallback(() => setState(EMPTY_STATE), []);

    const context = useMemo(() => ({ state, settings, setSettings, activeTab, setActiveTab }), [state, settings, setSettings, activeTab]);
    void context; // ponytail: passed to panels by Task 16, no panels mounted yet

    return (
        <div className="flex flex-col h-full w-full relative overflow-visible p-0 bg-transparent">
            <motion.div
                variants={panelVariants}
                initial="hidden"
                animate={isExiting ? 'exit' : 'visible'}
                exit="exit"
                className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-6 bg-base-100/10 backdrop-blur-md flex items-center justify-between">
                        <TerminalText text="LORA EDITOR" delay={2.0} className="text-[10px] font-black uppercase text-primary" />
                        {state.file && (
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-mono text-base-content/40 truncate max-w-xs">{state.file.name}</span>
                                <button onClick={handleReset} className="form-btn h-7 px-3 text-[10px]">CLEAR</button>
                                <button onClick={() => setIsSettingsOpen(true)} className="form-btn h-7 px-3 text-[10px]">SETTINGS</button>
                            </div>
                        )}
                    </motion.header>
                    <div className="flex-grow p-6 bg-transparent relative flex flex-col overflow-hidden">
                        {isLoading ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-primary animate-pulse">{loadingMessage || 'Processing...'}</span>
                            </div>
                        ) : !state.file ? (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                                onDragEnter={() => setIsDragging(true)}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                            >
                                <label className={`w-full h-full rounded-none flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'bg-primary/10' : 'hover:bg-base-200/20'}`}>
                                    <input type="file" accept=".safetensors,.gguf" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                                    <UploadIcon className="w-16 h-16 text-base-content/20 mb-6" />
                                    <h2 className="text-2xl font-black uppercase tracking-tighter">DROP LORA FILE</h2>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-base-content/40 mt-2 px-4 text-center">.safetensors or .gguf — drop or click to select</p>
                                </label>
                            </div>
                        ) : (
                            <div className="text-xs font-mono text-base-content/60 overflow-y-auto">
                                {Object.keys(state.fileMetadata).length} metadata fields parsed. AutoV2: {state.hashes.autov2 || 'n/a'}, AutoV3: {state.hashes.autov3 || 'n/a'}.
                                {/* Task 16 replaces this block with the tab bar + panels. */}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoraEditorPage;
