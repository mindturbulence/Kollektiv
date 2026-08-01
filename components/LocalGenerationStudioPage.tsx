import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, pageVariants, pageHeaderVariants, pageBodyVariants, pageFooterVariants } from './AnimatedPanels';
import { useSettings } from '../contexts/SettingsContext';
import { useLocalGenerationStudio, type StudioBackendId, type StudioParams } from '../hooks/useLocalGenerationStudio';
import WorkflowImportModal from './WorkflowImportModal';
import ExtraNetworksPanel from './ExtraNetworksPanel';
import type { LoraInfo, AdditionalModuleType } from '../services/generationBackend';
import {
  injectWorkflowParameters,
  type SavedWorkflowEntry,
} from '../services/comfyWorkflowParser';
import { loadWorkflowSchemas, deleteWorkflowSchema } from '../utils/workflowStorage';
import { loadPresets, savePreset, deletePreset, generatePresetId, type GenerationPreset } from '../utils/presetStorage';
import { RefreshIcon } from './icons';

interface LocalGenerationStudioPageProps {
  backendId: StudioBackendId;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

interface BackendMeta {
  label: string;
  urlField: 'comfyUrl' | 'a1111Url';
  modelField: 'comfyModel' | 'a1111Model';
  samplerField: 'comfySampler' | 'a1111Sampler';
  /** Fallback sampler list used when the backend is unreachable or hasn't responded yet. */
  fallbackSamplers: string[];
}

// Segment order for the Additional Modules picker — mirrors how Forge's own
// "VAE / Text Encoder" multiselect groups files, plus forward-compat types.
const MODULE_GROUP_ORDER: { type: AdditionalModuleType; label: string }[] = [
  { type: 'text_encoder', label: 'Text Encoders' },
  { type: 'vae', label: 'VAE' },
  { type: 'clip', label: 'CLIP' },
  { type: 'unet', label: 'UNet' },
  { type: 'other', label: 'Other' },
];

const BACKEND_META: Record<StudioBackendId, BackendMeta> = {
  comfy: {
    label: 'ComfyUI',
    urlField: 'comfyUrl',
    modelField: 'comfyModel',
    samplerField: 'comfySampler',
    fallbackSamplers: ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde', 'ddim'],
  },
  a1111: {
    label: 'A1111 / Forge Neo',
    urlField: 'a1111Url',
    modelField: 'a1111Model',
    samplerField: 'a1111Sampler',
    fallbackSamplers: ['Euler', 'Euler a', 'DPM++ 2M', 'DPM++ SDE Karras', 'DDIM'],
  },
};

const LocalGenerationStudioPage: React.FC<LocalGenerationStudioPageProps> = ({ backendId, showGlobalFeedback }) => {
  const { settings, updateSettings } = useSettings();
  const meta = BACKEND_META[backendId];
  const { state, checkAvailability, refreshModels, refreshSamplers, refreshLoras, refreshEmbeddings, refreshModules, generate, cancel, reset } = useLocalGenerationStudio(backendId);
  const supportsExtraNetworks = backendId === 'a1111';

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7);
  const [seedText, setSeedText] = useState('');
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const samplerFromSettings = (settings as any)[meta.samplerField] || '';
  const [sampler, setSampler] = useState(
    samplerFromSettings || meta.fallbackSamplers[0],
  );
  const [additionalModulesText, setAdditionalModulesText] = useState(settings.a1111AdditionalModules || '');
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Autogrow the prompt textarea with its content, capped so a huge paste
  // doesn't push the result area out of view — scrolls internally past that.
  // A plain inline style (set imperatively, not via React's style prop) beats
  // .form-input's un-!important `height: 2.5rem`, so no !important override
  // is needed here — and using one would fight this effect instead of help it.
  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [prompt]);

  // ── Workflow import state ──────────────────────────────────────────
  const [workflowEntries, setWorkflowEntries] = useState<SavedWorkflowEntry[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('__default__');
  const [showImportModal, setShowImportModal] = useState(false);

  // Load saved workflows on mount
  useEffect(() => {
    loadWorkflowSchemas().then(setWorkflowEntries);
  }, []);

  // ── Preset state ────────────────────────────────────────────────────
  const [presets, setPresets] = useState<GenerationPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const backendPresets = presets.filter((p) => p.backendId === backendId);

  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  const model = (settings as any)[meta.modelField] || '';
  const serverUrl = (settings as any)[meta.urlField] || '';

  useEffect(() => {
    checkAvailability(settings);
    refreshModels(settings);
    refreshSamplers(settings);
    refreshLoras(settings);
    refreshEmbeddings(settings);
    refreshModules(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendId, serverUrl]);

  const setModel = useCallback((value: string) => {
    updateSettings({ ...settings, [meta.modelField]: value });
  }, [settings, updateSettings, meta.modelField]);

  const setSamplerPersist = useCallback((value: string) => {
    setSampler(value);
    updateSettings({ ...settings, [meta.samplerField]: value });
  }, [settings, updateSettings, meta.samplerField]);

  const setAdditionalModulesPersist = useCallback((value: string) => {
    setAdditionalModulesText(value);
    updateSettings({ ...settings, a1111AdditionalModules: value });
  }, [settings, updateSettings]);

  // ── Additional modules multi-select ────────────────────────────────
  // The persisted value stays a comma-separated string (preset/settings
  // compatibility); the checkbox list is derived from it.
  const selectedModules = useMemo(
    () => additionalModulesText.split(',').map((m) => m.trim()).filter(Boolean),
    [additionalModulesText],
  );
  // Persisted names that aren't in the scanned list (manual entries, or files
  // added to the server after the last scan) — surfaced as removable chips so
  // nothing silently disappears when the scanned list is available.
  const manualModules = useMemo(
    () => selectedModules.filter((m) => !state.modules.some((mod) => mod.name === m)),
    [selectedModules, state.modules],
  );

  // Scanned modules bucketed by type (text encoder / vae / clip / unet / other),
  // each bucket sorted alphabetically for stable ordering.
  const moduleGroups = useMemo(() => {
    return MODULE_GROUP_ORDER
      .map((group) => ({
        ...group,
        modules: state.modules
          .filter((m) => m.type === group.type)
          .map((m) => m.name)
          .sort(),
      }))
      .filter((group) => group.modules.length > 0);
  }, [state.modules]);

  const toggleModule = useCallback((name: string) => {
    const current = additionalModulesText.split(',').map((m) => m.trim()).filter(Boolean);
    const next = current.includes(name) ? current.filter((m) => m !== name) : [...current, name];
    setAdditionalModulesPersist(next.join(', '));
  }, [additionalModulesText, setAdditionalModulesPersist]);

  const removeManualModule = useCallback((name: string) => {
    const next = additionalModulesText.split(',').map((m) => m.trim()).filter(Boolean).filter((m) => m !== name);
    setAdditionalModulesPersist(next.join(', '));
  }, [additionalModulesText, setAdditionalModulesPersist]);

  // ── Presets ─────────────────────────────────────────────────────────
  // Applies model/sampler/additionalModules in one updateSettings call —
  // three separate calls would each close over the same stale `settings`
  // snapshot and the last one would win, silently dropping the others.
  const applyPreset = useCallback((preset: GenerationPreset) => {
    setNegativePrompt(preset.negativePrompt);
    setWidth(preset.width);
    setHeight(preset.height);
    setSteps(preset.steps);
    setCfgScale(preset.cfgScale);
    setRandomizeSeed(preset.randomizeSeed);
    setSeedText(preset.seed !== null ? String(preset.seed) : '');
    setSampler(preset.sampler);
    setAdditionalModulesText(preset.additionalModules);
    updateSettings({
      ...settings,
      [meta.modelField]: preset.model,
      [meta.samplerField]: preset.sampler,
      a1111AdditionalModules: preset.additionalModules,
    });
  }, [settings, updateSettings, meta.modelField, meta.samplerField]);

  const handlePresetSelect = useCallback((id: string) => {
    setActivePresetId(id);
    if (!id) return;
    const preset = backendPresets.find((p) => p.id === id);
    if (preset) applyPreset(preset);
  }, [backendPresets, applyPreset]);

  const handleSavePreset = useCallback(async () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset: GenerationPreset = {
      id: generatePresetId(),
      name,
      backendId,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed: randomizeSeed ? null : (parseInt(seedText, 10) || 0),
      randomizeSeed,
      sampler,
      model,
      additionalModules: additionalModulesText,
      createdAt: Date.now(),
    };
    try {
      await savePreset(preset);
      setPresets((prev) => [...prev, preset]);
      setActivePresetId(preset.id);
      setNewPresetName('');
      setShowSaveInput(false);
      showGlobalFeedback(`Saved preset "${name}".`);
    } catch {
      showGlobalFeedback('Failed to save preset.', true);
    }
  }, [
    newPresetName, backendId, negativePrompt, width, height, steps, cfgScale,
    randomizeSeed, seedText, sampler, model, additionalModulesText, showGlobalFeedback,
  ]);

  const handleDeletePreset = useCallback(async () => {
    const preset = backendPresets.find((p) => p.id === activePresetId);
    if (!preset) return;
    try {
      await deletePreset(preset.id);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
      setActivePresetId('');
      showGlobalFeedback(`Deleted preset "${preset.name}".`);
    } catch {
      showGlobalFeedback('Failed to delete preset.', true);
    }
  }, [activePresetId, backendPresets, showGlobalFeedback]);

  // ── Extra networks (LoRA / textual inversion) ──────────────────────
  const insertIntoPrompt = useCallback((text: string) => {
    setPrompt((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text));
  }, []);

  const handleInsertLora = useCallback((lora: LoraInfo) => {
    insertIntoPrompt(`<lora:${lora.alias}:1>`);
  }, [insertIntoPrompt]);

  const handleInsertEmbedding = useCallback((name: string) => {
    insertIntoPrompt(name);
  }, [insertIntoPrompt]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || state.phase === 'generating') return;

    const seed = randomizeSeed ? null : (parseInt(seedText, 10) || 0);
    const additionalModules = backendId === 'a1111'
      ? additionalModulesText.split(',').map((m) => m.trim()).filter(Boolean)
      : undefined;

    const params: StudioParams = {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed,
      sampler,
      model,
      additionalModules,
    };

    // If a custom workflow is active, pre-inject parameters into it
    // and pass the resulting JSON as customWorkflowJson
    if (activeWorkflowId !== '__default__') {
      const entry = workflowEntries.find((e) => e.id === activeWorkflowId);
      if (entry) {
        const injected = injectWorkflowParameters(entry.schema, {
          prompt: params.prompt,
          negativePrompt: params.negativePrompt || undefined,
          seed: params.seed ?? undefined,
          steps: params.steps,
          cfg: params.cfgScale,
          samplerName: params.sampler || undefined,
        });
        // Add dimensions for EmptyLatentImage if the schema has targets for them
        // (auto-detected from web-ui exports)
        if (entry.schema.targetInputs.seed.length > 0) {
          // The workflow already has size config; just pass the injected JSON
        }
        generate({ ...params, customWorkflowJson: injected }, settings);
        return;
      }
    }

    generate(params, settings);
  }, [
    prompt, negativePrompt, width, height, steps, cfgScale,
    seedText, randomizeSeed, sampler, model, state.phase,
    generate, settings, activeWorkflowId, workflowEntries, backendId, additionalModulesText,
  ]);

  const handleWorkflowImported = useCallback((entry: SavedWorkflowEntry) => {
    setWorkflowEntries((prev) => {
      const filtered = prev.filter((e) => e.id !== entry.id);
      return [...filtered, entry];
    });
    setActiveWorkflowId(entry.id);
  }, []);

  const handleDeleteWorkflow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeWorkflowId === '__default__') return;
    const entry = workflowEntries.find((w) => w.id === activeWorkflowId);
    if (!entry) return;
    try {
      await deleteWorkflowSchema(entry.id);
      setWorkflowEntries((prev) => prev.filter((w) => w.id !== entry.id));
      setActiveWorkflowId('__default__');
      showGlobalFeedback(`Deleted "${entry.label}"`);
    } catch {
      showGlobalFeedback('Failed to delete workflow.', true);
    }
  }, [activeWorkflowId, workflowEntries, showGlobalFeedback]);

  useEffect(() => {
    if (state.phase === 'done') showGlobalFeedback('Saved to gallery.');
    if (state.phase === 'error' && state.error) showGlobalFeedback(state.error, true);
  }, [state.phase, state.error, showGlobalFeedback]);

  return (
    <div className="h-full min-h-0 flex gap-6 font-mono">
      {/* Left: Params */}
      <motion.aside
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="w-[26rem] shrink-0 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
      >
        <PanelLine position="top" delay={0.4} />
        <PanelLine position="bottom" delay={0.5} />
        <PanelLine position="left" delay={0.6} />
        <PanelLine position="right" delay={0.7} />
        <ScanLine delay={3.5} />
        <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
          <motion.header
            variants={pageHeaderVariants}
            initial="hidden"
            animate="visible"
            className="h-16 flex items-center flex-shrink-0 bg-base-100/80 backdrop-blur-md px-3 gap-1.5 panel-header overflow-visible relative z-[800]"
          >
            <select
              value={activePresetId}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="form-input flex-1 min-w-0 text-[10px] h-8"
            >
              <option value="">Preset: None</option>
              {backendPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            {showSaveInput ? (
              <>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                  placeholder="Preset name"
                  autoFocus
                  className="form-input text-[10px] h-8 w-28 shrink-0"
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="font-sf-mono text-[9px] tracking-widest text-primary/60 hover:text-primary transition-all bg-primary/5 disabled:opacity-20 px-2 py-1.5 hover:bg-primary/10 shrink-0"
                >
                  SAVE
                </button>
                <button
                  onClick={() => { setShowSaveInput(false); setNewPresetName(''); }}
                  className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all bg-base-100/5 px-2 py-1.5 hover:bg-base-100/10 shrink-0"
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                title="Save current settings as a preset"
                className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all bg-base-100/5 px-2 py-1.5 hover:bg-base-100/10 shrink-0 whitespace-nowrap"
              >
                + SAVE
              </button>
            )}
            {activePresetId && (
              <button
                onClick={handleDeletePreset}
                title="Delete this preset"
                className="font-sf-mono text-[9px] tracking-widest text-error/40 hover:text-error transition-all bg-error/5 px-2 py-1.5 hover:bg-error/10 shrink-0"
              >
                DELETE
              </button>
            )}
          </motion.header>
          <motion.div
            variants={pageBodyVariants}
            initial="hidden"
            animate="visible"
            className="flex-grow p-6 overflow-y-auto overflow-x-hidden custom-scrollbar bg-transparent flex flex-col gap-4"
          >
            {backendId === 'comfy' && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
                  Workflow
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={activeWorkflowId}
                    onChange={(e) => setActiveWorkflowId(e.target.value)}
                    className="form-input flex-1 min-w-0 text-xs"
                  >
                    <option value="__default__">Default (txt2img)</option>
                    {workflowEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="form-btn px-2 text-[9px] whitespace-nowrap font-bold uppercase tracking-wider"
                    title="Import custom workflow"
                  >
                    + IMPORT
                  </button>
                  {activeWorkflowId !== '__default__' && (
                    <button
                      onClick={handleDeleteWorkflow}
                      className="form-btn px-2 text-[9px] whitespace-nowrap font-bold uppercase tracking-wider text-error/60 hover:text-error transition-colors"
                      title="Delete this workflow"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
                Checkpoint
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="form-input flex-1 min-w-0 text-xs"
                  title={model || undefined}
                >
                  <option value="">{state.loadingModels ? 'Loading…' : 'Auto (first available)'}</option>
                  {state.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button
                  onClick={() => refreshModels(settings)}
                  disabled={state.loadingModels}
                  className="form-btn px-2 shrink-0"
                  title="Refresh checkpoint list from backend"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${state.loadingModels ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {backendId === 'a1111' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40">
                    Additional Modules
                  </label>
                  <button
                    onClick={() => refreshModules(settings)}
                    disabled={state.loadingModules}
                    className="form-btn px-2 shrink-0"
                    title="Rescan available CLIP/T5/VAE modules from the server"
                  >
                    <RefreshIcon className={`w-3 h-3 ${state.loadingModules ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {state.modules.length > 0 ? (
                  <div className="border border-base-300/20 max-h-44 overflow-y-auto custom-scrollbar divide-y divide-base-300/10">
                    {moduleGroups.map((group) => (
                      <div key={group.type}>
                        <div className="px-2 pt-1.5 pb-0.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-base-content/30">
                          {group.label}
                          <span className="text-base-content/20 font-mono">{group.modules.length}</span>
                        </div>
                        {group.modules.map((m) => {
                          const checked = selectedModules.includes(m);
                          return (
                            <label
                              key={m}
                              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-base-100/40 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleModule(m)}
                                className="checkbox checkbox-xs checkbox-primary rounded-none"
                              />
                              <span className="truncate" title={m}>{m}</span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={additionalModulesText}
                    onChange={(e) => setAdditionalModulesPersist(e.target.value)}
                    className="form-input w-full text-xs"
                    placeholder="clip_l.safetensors, t5xxl_fp16.safetensors, ae.safetensors"
                  />
                )}

                {state.modules.length > 0 && manualModules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {manualModules.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-base-100/40 border border-base-300/20 text-[9px] font-mono"
                      >
                        {m}
                        <button
                          onClick={() => removeManualModule(m)}
                          className="text-base-content/40 hover:text-error transition-colors"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-[9px] text-base-content/30 mt-1">
                  {state.modules.length > 0
                    ? 'CLIP/T5/VAE modules scanned from the server (Forge /sdapi/v1/sd-modules). Required by split checkpoints (Flux, SD3, GGUF) that don\'t embed their own text encoder — fixes "You do not have CLIP state dict!".'
                    : 'Comma-separated CLIP/T5/VAE filenames for split checkpoints (Flux, SD3, GGUF) that don\'t embed their own text encoder — fixes "You do not have CLIP state dict!". The server did not expose a module list (vanilla A1111).'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Width</label>
                <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value, 10) || 512)} className="form-input w-full text-xs" step={64} min={64} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Height</label>
                <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value, 10) || 512)} className="form-input w-full text-xs" step={64} min={64} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Steps</label>
                <input type="number" value={steps} onChange={(e) => setSteps(parseInt(e.target.value, 10) || 1)} className="form-input w-full text-xs" min={1} max={150} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">CFG Scale</label>
                <input type="number" value={cfgScale} onChange={(e) => setCfgScale(parseFloat(e.target.value) || 1)} className="form-input w-full text-xs" step={0.5} min={1} max={30} />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
                Sampler
                {state.loadingSamplers && (
                  <span className="text-[9px] text-base-content/20 ml-2 italic">loading...</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <select value={sampler} onChange={(e) => setSamplerPersist(e.target.value)} className="form-input flex-1 min-w-0 text-xs" title={sampler || undefined}>
                  {(state.samplers.length > 0 ? state.samplers : meta.fallbackSamplers).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  onClick={() => refreshSamplers(settings)}
                  disabled={state.loadingSamplers}
                  className="form-btn px-2 shrink-0"
                  title="Refresh sampler list from backend"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${state.loadingSamplers ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Seed</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  disabled={randomizeSeed}
                  className="form-input flex-1 text-xs disabled:opacity-30"
                  placeholder="random"
                />
                <label className="flex items-center gap-1.5 text-[10px] text-base-content/50 whitespace-nowrap">
                  <input type="checkbox" checked={randomizeSeed} onChange={(e) => setRandomizeSeed(e.target.checked)} />
                  Random
                </label>
              </div>
            </div>
          </motion.div>
          <motion.footer
            variants={pageFooterVariants}
            initial="hidden"
            animate="visible"
            className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
          >
            {state.phase === 'generating' ? (
              <button onClick={cancel} className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-error/60 hover:text-error border-1 btn-snake">
                <span /><span /><span /><span />CANCEL
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || state.available === false}
                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
              >
                <span /><span /><span /><span />GENERATE
              </button>
            )}
            {(state.phase === 'done' || state.phase === 'error') && (
              <button onClick={reset} className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-base-content/40 hover:text-primary border-1 btn-snake">
                <span /><span /><span /><span />CLEAR
              </button>
            )}
          </motion.footer>
        </div>
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </motion.aside>

      {/* Center: Result + Prompt */}
      <motion.main
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 min-w-0 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
      >
        <PanelLine position="top" delay={0.4} />
        <PanelLine position="bottom" delay={0.5} />
        <PanelLine position="left" delay={0.6} />
        <PanelLine position="right" delay={0.7} />
        <ScanLine delay={3.5} />
        <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
          <motion.header
            variants={pageHeaderVariants}
            initial="hidden"
            animate="visible"
            className="px-6 h-16 flex justify-between items-center bg-base-100/80 backdrop-blur-md panel-header overflow-visible relative z-[800] gap-4"
          >
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter">{meta.label} Studio</h1>
              <p className="text-xs text-base-content/40 mt-1">
                Generate directly against your local {meta.label} instance.
              </p>
            </div>
            {state.available === false && (
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-error shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                Not reachable at {serverUrl}
              </div>
            )}
            {state.available === true && (
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-success shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Connected
              </div>
            )}
          </motion.header>
          <motion.div
            variants={pageBodyVariants}
            initial="hidden"
            animate="visible"
            className="flex-grow min-h-0 flex flex-col p-6 gap-4"
          >
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-base-300/10 rounded">
              {state.phase === 'generating' && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 animate-pulse">
                  Generating via {meta.label}...
                </div>
              )}
              {state.phase === 'error' && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-error px-6 text-center">
                  {state.error}
                </div>
              )}
              {state.phase === 'done' && state.resultUrl && (
                <div className="flex flex-col items-center gap-2 p-4">
                  <img src={state.resultUrl} alt="Generated result" className="max-h-[60vh] max-w-full rounded shadow-lg" />
                  <div className="text-[10px] text-base-content/30">
                    Seed: {state.resultSeed} · Saved to gallery
                  </div>
                </div>
              )}
              {state.phase === 'idle' && !state.resultUrl && (
                <p className="text-[10px] text-base-content/20 uppercase tracking-widest">
                  Enter a prompt and click Generate
                </p>
              )}
            </div>

            {/* Prompt bar (bottom of center panel) */}
            <div className="shrink-0 flex flex-col gap-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40">Prompt</label>
                  <button
                    onClick={() => setShowNegativePrompt((v) => !v)}
                    className="text-[9px] font-bold uppercase tracking-wider text-base-content/30 hover:text-base-content/60 transition-colors"
                  >
                    {showNegativePrompt ? 'Hide' : 'Show'} Negative Prompt
                  </button>
                </div>
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="form-input w-full text-xs py-3 resize-none overflow-y-auto"
                  placeholder="a photo of..."
                />
              </div>

              {showNegativePrompt && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">Negative Prompt</label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={2}
                    className="form-input w-full text-xs !h-auto py-3"
                    placeholder="blurry, low quality..."
                  />
                </div>
              )}
            </div>
          </motion.div>
        </div>
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </motion.main>

      {/* Right: Extra Networks */}
      <ExtraNetworksPanel
        supported={supportsExtraNetworks}
        settings={settings}
        loras={state.loras}
        loadingLoras={state.loadingLoras}
        embeddings={state.embeddings}
        loadingEmbeddings={state.loadingEmbeddings}
        onRefreshLoras={() => refreshLoras(settings)}
        onRefreshEmbeddings={() => refreshEmbeddings(settings)}
        onInsertLora={handleInsertLora}
        onInsertEmbedding={handleInsertEmbedding}
      />

      {/* ── Workflow Import Modal ──────────────────────────────── */}
      <WorkflowImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={handleWorkflowImported}
      />
    </div>
  );
};

export { LocalGenerationStudioPage };
export default LocalGenerationStudioPage;
