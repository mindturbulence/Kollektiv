import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SettingRow, ProviderTab, SettingsGroup } from '../settings/primitives';
import { CloseIcon } from '../icons';
import type { LoraEditorSettings, CustomFieldDef } from './types';

type DrawerTab = 'general' | 'summary' | 'editor' | 'customFields' | 'lookup';

interface SettingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: LoraEditorSettings;
    onChange: (next: LoraEditorSettings) => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose, settings, onChange }) => {
    const [tab, setTab] = useState<DrawerTab>('general');

    const set = <K extends keyof LoraEditorSettings>(key: K, value: LoraEditorSettings[K]) => onChange({ ...settings, [key]: value });

    const updateCustomField = (index: number, patch: Partial<CustomFieldDef>) => {
        const next = settings.customFields.slice();
        next[index] = { ...next[index], ...patch };
        set('customFields', next);
    };
    const addCustomField = () => set('customFields', [...settings.customFields, { label: '', calc: '' }]);
    const removeCustomField = (index: number) => set('customFields', settings.customFields.filter((_, i) => i !== index));

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[600] bg-base-100/80 backdrop-blur-sm flex justify-end"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                        className="w-full max-w-2xl h-full bg-base-100 border-l border-base-content/10 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-base-content/10">
                            <h2 className="text-xs font-black uppercase tracking-widest">LoRA Editor Settings</h2>
                            <button onClick={onClose} className="form-btn h-8 w-8 flex items-center justify-center"><CloseIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="flex gap-1 p-2 border-b border-base-content/10">
                            <ProviderTab label="General" isActive={tab === 'general'} onClick={() => setTab('general')} />
                            <ProviderTab label="Summary" isActive={tab === 'summary'} onClick={() => setTab('summary')} />
                            <ProviderTab label="Editor" isActive={tab === 'editor'} onClick={() => setTab('editor')} />
                            <ProviderTab label="Custom Fields" isActive={tab === 'customFields'} onClick={() => setTab('customFields')} />
                            <ProviderTab label="Online Lookup" isActive={tab === 'lookup'} onClick={() => setTab('lookup')} />
                        </div>

                        {tab === 'general' && (
                            <SettingsGroup title="General">
                                <SettingRow label="Show Undefined Summary Values" desc="Display 'undefined' instead of hiding fields with no value.">
                                    <input type="checkbox" checked={settings.showUndefinedSummaryValues} onChange={(e) => set('showUndefinedSummaryValues', e.target.checked)} className="checkbox checkbox-primary" />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'summary' && (
                            <SettingsGroup title="Summary Fields">
                                <SettingRow label="Layout" desc="JSON: raw key/value dump. Table: one row per field. Dashboard: the custom HTML template below.">
                                    <select value={settings.summaryLayout} onChange={(e) => set('summaryLayout', e.target.value as LoraEditorSettings['summaryLayout'])} className="form-select">
                                        <option value="json">JSON</option>
                                        <option value="table">Table</option>
                                        <option value="custom">Dashboard</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Fields" desc="Comma-separated field names. Prefix with civitai./custom. for those sources.">
                                    <textarea value={settings.summaryFields} onChange={(e) => set('summaryFields', e.target.value)} rows={6} className="form-textarea w-full font-mono text-xs" spellCheck={false} />
                                </SettingRow>
                                <SettingRow label="Custom Dashboard Template" desc="HTML template with {{field}} placeholders. {{field?}} omits the field entirely when undefined.">
                                    <textarea value={settings.customTemplate} onChange={(e) => set('customTemplate', e.target.value)} rows={16} className="form-textarea w-full font-mono text-[10px]" spellCheck={false} />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'editor' && (
                            <SettingsGroup title="Metadata Editor Fields">
                                <SettingRow label="Fields" desc="Comma-separated field names shown in the editor's Simple view.">
                                    <textarea value={settings.editorFields} onChange={(e) => set('editorFields', e.target.value)} rows={4} className="form-textarea w-full font-mono text-xs" spellCheck={false} />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'customFields' && (
                            <SettingsGroup title="Custom Fields">
                                <div className="p-6 space-y-3">
                                    <p className="text-[10px] text-base-content/40 uppercase tracking-widest leading-relaxed">
                                        JavaScript expressions evaluated in order. Available: fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, customMetadata (earlier fields), safetensorsFile.
                                    </p>
                                    {settings.customFields.map((field, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <input value={field.label} onChange={(e) => updateCustomField(i, { label: e.target.value })} placeholder="label" className="form-input w-40 font-mono text-xs flex-shrink-0" />
                                            <textarea value={field.calc} onChange={(e) => updateCustomField(i, { calc: e.target.value })} placeholder="calculation" rows={2} className="form-textarea flex-grow font-mono text-xs" spellCheck={false} />
                                            <button onClick={() => removeCustomField(i)} className="form-btn h-8 px-2 text-error/60 hover:text-error flex-shrink-0">X</button>
                                        </div>
                                    ))}
                                    <button onClick={addCustomField} className="form-btn h-8 px-3 text-[10px]">ADD CUSTOM FIELD</button>
                                </div>
                            </SettingsGroup>
                        )}

                        {tab === 'lookup' && (
                            <SettingsGroup title="Resource Lookup">
                                <SettingRow label="Primary Lookup">
                                    <select value={settings.primaryLookup} onChange={(e) => set('primaryLookup', e.target.value as LoraEditorSettings['primaryLookup'])} className="form-select">
                                        <option value="">Disabled</option>
                                        <option value="civ">CivitAI</option>
                                        <option value="aec">Arc En Ciel</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Secondary Lookup">
                                    <select value={settings.secondaryLookup} onChange={(e) => set('secondaryLookup', e.target.value as LoraEditorSettings['secondaryLookup'])} className="form-select">
                                        <option value="">Disabled</option>
                                        <option value="civ">CivitAI</option>
                                        <option value="aec">Arc En Ciel</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Use HTTP Proxy for Arc En Ciel" desc="Required for Arc En Ciel lookups due to CORS restrictions.">
                                    <input type="checkbox" checked={settings.enableProxy} onChange={(e) => set('enableProxy', e.target.checked)} className="checkbox checkbox-primary" />
                                </SettingRow>
                                <SettingRow label="Proxy URL">
                                    <input value={settings.proxyUrl} onChange={(e) => set('proxyUrl', e.target.value)} className="form-input w-full font-mono text-xs" />
                                </SettingRow>
                            </SettingsGroup>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SettingsDrawer;
