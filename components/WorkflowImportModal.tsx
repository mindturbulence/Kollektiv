import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, UploadIcon, BracesIcon } from './icons';
import { audioService } from '../services/audioService';
import {
  autoDetectTargets,
  detectNodeInputs,
  isPromptRequestFormat,
  convertComfyUIExportToPromptRequest,
  type ComfyWorkflowSchema,
  type ComfyNodeTarget,
  type SavedWorkflowEntry,
} from '../services/comfyWorkflowParser';
import { saveWorkflowSchema, generateWorkflowId } from '../utils/workflowStorage';

// ── Types ──────────────────────────────────────────────────────────────

type ParamKey = keyof ComfyWorkflowSchema['targetInputs'];

interface WorkflowImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (entry: SavedWorkflowEntry) => void;
}

interface RawNodeInfo {
  nodeId: string;
  classType: string;
  title?: string;
  inputFields: string[];
}

// ── Constants ──────────────────────────────────────────────────────────

const PARAM_LABELS: Record<ParamKey, string> = {
  positivePrompt: 'Positive Prompt',
  negativePrompt: 'Negative Prompt',
  seed: 'Seed',
  steps: 'Steps',
  cfg: 'CFG Scale',
  samplerName: 'Sampler Name',
};

const PARAM_DESCRIPTIONS: Record<ParamKey, string> = {
  positivePrompt: 'Text input for the positive prompt (CLIPTextEncode)',
  negativePrompt: 'Text input for the negative prompt (CLIPTextEncode)',
  seed: 'Random seed value (KSampler)',
  steps: 'Number of sampling steps (KSampler)',
  cfg: 'CFG classifier-free guidance scale (KSampler)',
  samplerName: 'Sampler algorithm name (KSampler)',
};

// ── Helpers ────────────────────────────────────────────────────────────

function buildNodeList(rawJson: Record<string, any>): RawNodeInfo[] {
  const nodes: RawNodeInfo[] = [];
  for (const [nodeId, node] of Object.entries(rawJson)) {
    if (!node || typeof node !== 'object') continue;
    const n = node as any;
    nodes.push({
      nodeId,
      classType: n.class_type || 'unknown',
      title: n._meta?.title,
      inputFields: detectNodeInputs(n),
    });
  }
  return nodes;
}

function targetToNodeKey(target: ComfyNodeTarget): string {
  return `${target.nodeId}::${target.fieldPath}`;
}

function nodeKeyToTarget(key: string): ComfyNodeTarget | null {
  const sep = key.indexOf('::');
  if (sep === -1) return null;
  return { nodeId: key.slice(0, sep), fieldPath: key.slice(sep + 2) };
}

/**
 * Build all possible key choices for a given parameter type.
 * Includes auto-detected targets plus all available text/numeric inputs.
 */
function buildChoices(rawJson: Record<string, any>, paramKey: ParamKey): string[] {
  const choices = new Set<string>();

  // Add auto-detected suggestions first
  const auto = autoDetectTargets(rawJson);
  for (const target of auto[paramKey]) {
    choices.add(targetToNodeKey(target));
  }

  // Add every node input field that could match
  const isNumeric = paramKey === 'seed' || paramKey === 'steps' || paramKey === 'cfg';
  const nodes = buildNodeList(rawJson);
  for (const node of nodes) {
    for (const field of node.inputFields) {
      const key = targetToNodeKey({ nodeId: node.nodeId, fieldPath: `inputs.${field}` });
      // For numeric params, prefer numeric-looking input names
      if (isNumeric && /^(seed|steps|cfg|denoise|batch_size)$/i.test(field)) {
        choices.add(key);
      }
      // For text params, prefer text-looking input names
      if (!isNumeric && /^(text|prompt|positive|negative|sampler_name|scheduler|ckpt_name)$/i.test(field)) {
        choices.add(key);
      }
    }
  }

  return Array.from(choices).sort();
}

function renderNodeKey(key: string, nodeList: RawNodeInfo[]): string {
  const target = nodeKeyToTarget(key);
  if (!target) return key;
  const node = nodeList.find((n) => n.nodeId === target.nodeId);
  const label = node?.title || `${node?.classType || '?'} [#${target.nodeId}]`;
  const fieldShort = target.fieldPath.replace('inputs.', '');
  return `${label} → ${fieldShort}`;
}

// ── Component ──────────────────────────────────────────────────────────

const WorkflowImportModal: React.FC<WorkflowImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState<'upload' | 'map'>('upload');
  const [rawJson, setRawJson] = useState<Record<string, any> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowLabel, setWorkflowLabel] = useState('');
  const [mapping, setMapping] = useState<Record<ParamKey, string[]>>({
    positivePrompt: [],
    negativePrompt: [],
    seed: [],
    steps: [],
    cfg: [],
    samplerName: [],
  });
  const [showRaw, setShowRaw] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  // ── File handling ────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith('.json')) {
      setError('Only .json files are accepted.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (typeof parsed !== 'object' || parsed === null) {
          setError('Invalid JSON — expected an object.');
          return;
        }

        let promptJson: Record<string, any> | null = null;
        if (isPromptRequestFormat(parsed)) {
          promptJson = parsed;
          setWorkflowLabel(file.name.replace(/\.json$/i, ''));
        } else {
          promptJson = convertComfyUIExportToPromptRequest(parsed);
          if (promptJson) {
            setWorkflowLabel(file.name.replace(/\.json$/i, '') + ' (converted)');
          } else {
            setError(
              'Could not parse workflow format. Export from ComfyUI using "Save (API Format)" and try again.',
            );
            return;
          }
        }

        setRawJson(promptJson!);
        initMapping(promptJson!);
        setStep('map');
      } catch {
        setError('Invalid JSON file.');
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  }, []);

  const initMapping = useCallback((json: Record<string, any>) => {
    const auto = autoDetectTargets(json);
    const newMapping: Record<ParamKey, string[]> = {
      positivePrompt: auto.positivePrompt.map(targetToNodeKey),
      negativePrompt: auto.negativePrompt.map(targetToNodeKey),
      seed: auto.seed.map(targetToNodeKey),
      steps: auto.steps.map(targetToNodeKey),
      cfg: auto.cfg.map(targetToNodeKey),
      samplerName: auto.samplerName.map(targetToNodeKey),
    };
    setMapping(newMapping);
  }, []);

  const handleResetAuto = useCallback(() => {
    if (!rawJson) return;
    initMapping(rawJson!);
  }, [rawJson, initMapping]);

  // ── Mapping helpers ──────────────────────────────────────────────────

  const addTarget = (param: ParamKey) => {
    setMapping((prev) => ({ ...prev, [param]: [...prev[param], ''] }));
  };

  const removeTarget = (param: ParamKey, idx: number) => {
    setMapping((prev) => ({
      ...prev,
      [param]: prev[param].filter((_, i) => i !== idx),
    }));
  };

  const changeTarget = (param: ParamKey, idx: number, value: string) => {
    setMapping((prev) => {
      const updated = [...prev[param]];
      updated[idx] = value;
      return { ...prev, [param]: updated };
    });
  };

  // ── Save ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!rawJson || saving) return;
    setSaving(true);
    audioService.playClick();

    const targetInputs = {
      positivePrompt: mapping.positivePrompt
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
      negativePrompt: mapping.negativePrompt
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
      seed: mapping.seed
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
      steps: mapping.steps
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
      cfg: mapping.cfg
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
      samplerName: mapping.samplerName
        .map(nodeKeyToTarget)
        .filter((t): t is ComfyNodeTarget => t !== null),
    };

    const schema: ComfyWorkflowSchema = {
      workflowName: workflowLabel || `Custom ${new Date().toLocaleDateString()}`,
      rawPromptJson: rawJson!,
      targetInputs,
    };

    const entry: SavedWorkflowEntry = {
      id: generateWorkflowId(),
      label: workflowLabel || schema.workflowName,
      schema,
      createdAt: Date.now(),
    };

    await saveWorkflowSchema(entry);
    setSaving(false);
    onImported(entry);
    handleClose();
  };

  const handleClose = () => {
    audioService.playClick();
    setStep('upload');
    setRawJson(null);
    setError(null);
    setWorkflowLabel('');
    setMapping({
      positivePrompt: [],
      negativePrompt: [],
      seed: [],
      steps: [],
      cfg: [],
      samplerName: [],
    });
    setShowRaw(false);
    onClose();
  };

  // ── Node info for display ────────────────────────────────────────────

  const nodeList = rawJson ? buildNodeList(rawJson) : [];

  // ── Render helpers ───────────────────────────────────────────────────

  const renderMappingRow = (paramKey: ParamKey) => {
    const keys = mapping[paramKey];
    const choices = rawJson ? buildChoices(rawJson, paramKey) : [];

    return (
      <div key={paramKey} className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/50">
            {PARAM_LABELS[paramKey]}
          </label>
          <span className="text-[9px] text-base-content/20 italic">{PARAM_DESCRIPTIONS[paramKey]}</span>
        </div>

        {keys.length === 0 && (
          <p className="text-[10px] text-base-content/20 italic px-1">No targets — param will be skipped.</p>
        )}

        {keys.map((key, idx) => (
          <div key={idx} className="flex items-center gap-1 mb-1">
            <select
              value={key}
              onChange={(e) => changeTarget(paramKey, idx, e.target.value)}
              className="form-input flex-1 text-[10px] h-7"
            >
              {key === '' && <option value="">— select —</option>}
              {choices.map((c) => (
                <option key={c} value={c}>
                  {renderNodeKey(c, nodeList)}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeTarget(paramKey, idx)}
              className="text-[9px] text-error/50 hover:text-error transition-colors px-1"
              title="Remove this target"
            >
              ✕
            </button>
          </div>
        ))}

        {keys.length > 0 && keys.some((k) => k !== '') && (
          <button
            onClick={() => addTarget(paramKey)}
            className="text-[9px] text-primary/50 hover:text-primary transition-colors uppercase tracking-wider mt-0.5"
          >
            + Add another {PARAM_LABELS[paramKey]} target
          </button>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="flex flex-col bg-transparent w-full max-w-2xl mx-auto relative p-[3px] corner-frame overflow-visible max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10 max-h-[90vh]">
          {/* ── Header ──────────────────────────────────────────── */}
          <header className="px-8 py-4 border-b border-base-300 bg-transparent relative flex items-center justify-between shrink-0">
            <div className="flex flex-col">
              <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                WORKFLOW<span className="text-primary">.</span>
              </h3>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">
                Custom ComfyUI Workflow Import
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-error/30 hover:text-error transition-all hover:scale-110"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </header>

          {/* ── Step: Upload ────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="p-10 space-y-6 overflow-y-auto">
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file) processFile(file);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`p-16 border-4 border-dashed rounded-none text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-primary/50 bg-transparent'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                  }}
                  className="hidden"
                  accept=".json"
                />
                <UploadIcon className="w-12 h-12 mx-auto text-base-content/20 mb-4" />
                <p className="text-sm font-black uppercase tracking-[0.2em] text-base-content/40">
                  Drop ComfyUI API-format JSON here
                </p>
                <p className="text-[10px] text-base-content/20 mt-2">
                  Export from ComfyUI via &ldquo;Save (API Format)&rdquo; or drag a web-ui export
                </p>
              </div>
              {error && (
                <p className="text-error font-bold text-xs uppercase tracking-widest">{error}</p>
              )}
            </div>
          )}

          {/* ── Step: Parameter Mapping ─────────────────────────── */}
          {step === 'map' && rawJson && (
            <div className="flex overflow-y-auto min-h-0">
              {/* Left: Node Explorer */}
              <div className="w-64 shrink-0 border-r border-base-300/30 p-4 overflow-y-auto">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 mb-2">
                  Node Explorer
                </h4>
                <div className="space-y-1">
                  {nodeList.map((node) => (
                    <div
                      key={node.nodeId}
                      className="text-[10px] font-mono px-2 py-1 rounded bg-base-300/10 border border-base-300/10"
                    >
                      <div className="font-bold text-primary/70">
                        #{node.nodeId} {node.title || node.classType}
                      </div>
                      <div className="text-base-content/30 truncate">{node.classType}</div>
                      {node.inputFields.length > 0 && (
                        <div className="text-base-content/20 text-[9px] mt-0.5">
                          inputs: {node.inputFields.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex gap-1">
                    <button
                      onClick={handleResetAuto}
                      className="flex-1 text-[9px] py-1 font-bold uppercase tracking-widest rounded bg-base-content/5 text-base-content/30 hover:bg-base-content/10 transition-colors"
                    >
                      Auto-Detect
                    </button>
                    <button
                      onClick={() => setShowRaw(!showRaw)}
                      className="text-[9px] px-2 font-bold uppercase tracking-widest rounded bg-base-content/5 text-base-content/30 hover:bg-base-content/10 transition-colors"
                      title="Toggle raw JSON view"
                    >
                      <BracesIcon className="w-3 h-3" />
                    </button>
                  </div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block">
                    Label
                  </label>
                  <input
                    value={workflowLabel}
                    onChange={(e) => setWorkflowLabel(e.target.value)}
                    className="form-input w-full text-[10px]"
                    placeholder="My Custom Workflow"
                  />
                </div>
              </div>

              {/* Right: Parameter Mapping */}
              <div className="flex-1 p-4 overflow-y-auto">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 mb-3">
                  Parameter Mapping
                </h4>
                <p className="text-[9px] text-base-content/20 mb-4 italic">
                  Map each studio parameter to the corresponding node input in your workflow.
                  Multiple targets are supported (e.g. dual CLIPTextEncode nodes).
                </p>
                {(Object.keys(PARAM_LABELS) as ParamKey[]).map(renderMappingRow)}
              </div>
            </div>
          )}

          {/* ── Raw JSON overlay preview ────────────────────────── */}
          {showRaw && rawJson && (
            <div className="border-t border-base-300/30 p-4 max-h-48 overflow-y-auto bg-black/20">
              <pre className="text-[9px] font-mono text-primary/50 whitespace-pre-wrap">
                {JSON.stringify(rawJson, null, 2)}
              </pre>
            </div>
          )}

          {/* ── Footer ──────────────────────────────────────────── */}
          <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
            <button
              onClick={handleClose}
              className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
            >
              <span /><span /><span /><span />
              CANCEL
            </button>
            {step === 'map' && (
              <button
                onClick={handleSave}
                className="btn btn-sm btn-primary h-full flex-1 rounded-none tracking-wider uppercase btn-snake-primary"
              >
                <span /><span /><span /><span />
                SAVE WORKFLOW
              </button>
            )}
          </footer>
        </div>

        {/* Corner Accents */}
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </div>
    </div>
  );

  if (typeof window !== 'undefined' && window.document?.body) {
    return createPortal(modalContent, window.document.body);
  }
  return null;
};

export { WorkflowImportModal };
export default WorkflowImportModal;
