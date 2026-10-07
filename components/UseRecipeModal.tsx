import React, { useEffect, useState } from 'react';
import type { RecipeBrief, RecipeMode } from '../types';
import { fileSystemManager, createZipAndDownload } from '../utils/fileUtils';
import { loadDesignLibrary } from '../utils/designLibraryStorage';
import {
  buildExportBundle,
  designDirExists,
  loadBriefDraft,
  saveBriefDraft,
  writeBundleToDirectory,
  type ExportBundle,
} from '../utils/designExport';
import { compileRecipePrompt } from '../utils/designRecipePrompt';
import { DESIGN_AGENTS, loadAgent, saveAgent, type DesignAgentId } from '../utils/designAgents';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';

interface Props {
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

interface PendingOverwrite {
  root: FileSystemDirectoryHandle;
  bundle: ExportBundle;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const errorName = (e: unknown): string => (typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : '');

const label = 'paper-label';

/** A picked folder handle can have an empty name (some pickers and roots), so messages need a fallback. */
const CHOSEN_FOLDER = 'the chosen folder';

const MORE_FIELDS = [
  ['job', 'Job of the page'],
  ['audience', 'Audience'],
  ['content', 'Content / copy'],
  ['stack', 'Stack'],
  ['constraints', 'Constraints'],
] as const satisfies readonly (readonly [keyof RecipeBrief, string])[];

const MODES: { value: RecipeMode; title: string; hint: string }[] = [
  { value: 'adapt', title: 'Adapt', hint: 'borrow the system, use your brand and copy' },
  { value: 'reproduce', title: 'Reproduce', hint: 'match the screenshots closely' },
];

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const UseRecipeModal: React.FC<Props> = ({ recipeId, recipeTitle, onClose, showGlobalFeedback }) => {
  const [draft] = useState(loadBriefDraft);
  const [brief, setBrief] = useState<RecipeBrief>(draft.brief);
  const [mode, setMode] = useState<RecipeMode>(draft.mode);
  const [moreOpen, setMoreOpen] = useState(() => MORE_FIELDS.some(([key]) => !!draft.brief[key]));
  const [showRequired, setShowRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackPrompt, setFallbackPrompt] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOverwrite | null>(null);
  const [agent, setAgent] = useState<DesignAgentId>(loadAgent);

  const canPick = typeof window.showDirectoryPicker === 'function';

  useEffect(() => { saveBriefDraft({ brief, mode }); }, [brief, mode]);

  const pickAgent = (id: DesignAgentId) => {
    setAgent(id);
    saveAgent(id);
  };

  const patch = (p: Partial<RecipeBrief>) => setBrief((b) => ({ ...b, ...p }));
  const projectMissing = !brief.project.trim();
  const pagesMissing = !brief.pages.trim();

  const run = async (fn: () => Promise<void>) => {
    if (!brief.project.trim() || !brief.pages.trim()) {
      setShowRequired(true);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setFallbackPrompt(null);
    try {
      await fn();
    } catch (e) {
      setError(errorName(e) === 'NotAllowedError' ? 'Permission denied writing to the chosen folder. Choose a folder you can write to.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** Copies the prompt; if the clipboard is blocked the prompt is shown so it is never lost. */
  const deliverPrompt = async (prompt: string, done: string) => {
    if (await tryCopy(prompt)) {
      setNotice(`${done} Prompt copied.`);
    } else {
      setFallbackPrompt(prompt);
      setNotice(`${done} The clipboard is blocked, so copy the prompt below.`);
    }
  };

  const loadBundle = async (zip: boolean): Promise<ExportBundle> => {
    const { recipes } = await loadDesignLibrary();
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new Error(`Design recipe not found: ${recipeId}`);
    const specPath = `design-library/${recipeId}/DESIGN.md`;
    const designMd = await fileSystemManager.readFile(specPath);
    if (designMd === null) throw new Error(`Could not read ${specPath}. Is the vault connected?`);
    const refs: { name: string; blob: Blob }[] = [];
    for (const path of recipe.refs) {
      const blob = await fileSystemManager.getFileAsBlob(path);
      if (!blob) throw new Error(`Could not read reference image ${path}. Is the vault connected?`);
      refs.push({ name: path.split('/').pop() ?? path, blob });
    }
    return buildExportBundle({ recipe, designMd, refs, brief, mode, zip });
  };

  const writeFolder = async (root: FileSystemDirectoryHandle, bundle: ExportBundle, overwrite: boolean) => {
    await writeBundleToDirectory(root, bundle.files, { overwrite });
    await deliverPrompt(bundle.prompt, `Wrote design/ to ${root.name ? `"${root.name}"` : CHOSEN_FOLDER}.`);
    showGlobalFeedback('Design bundle exported');
  };

  const exportToFolder = () => run(async () => {
    // The picker needs a recent user gesture, and loading from a Drive vault can be slow, so ask for the folder first.
    if (!window.showDirectoryPicker) throw new Error('This browser cannot pick a folder.');
    let root: FileSystemDirectoryHandle;
    try {
      root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'kollektiv-design-export' });
    } catch (e) {
      if (errorName(e) === 'AbortError') return;
      throw e;
    }
    const bundle = await loadBundle(false);
    if (await designDirExists(root)) {
      setPending({ root, bundle });
      return;
    }
    await writeFolder(root, bundle, false);
  });

  const confirmOverwrite = () => {
    if (!pending) return;
    const { root, bundle } = pending;
    setPending(null);
    void run(() => writeFolder(root, bundle, true));
  };

  const downloadZip = () => run(async () => {
    const bundle = await loadBundle(true);
    await createZipAndDownload(bundle.files.map((f) => ({ name: f.path, content: f.content })), 'design.zip');
    await deliverPrompt(bundle.prompt, 'Downloaded design.zip. Unzip it into your repo root so design/ sits at the top level.');
  });

  const copyOnly = () => run(() => deliverPrompt(compileRecipePrompt(brief, mode), 'Nothing was exported.'));

  const copyFallback = async () => {
    if (fallbackPrompt && (await tryCopy(fallbackPrompt))) {
      setFallbackPrompt(null);
      setNotice('Prompt copied.');
    }
  };

  const requiredField = (text: string, key: 'project' | 'pages', placeholder: string, missing: boolean) => (
    <label className="flex flex-col gap-1">
      <span className={label}>{text} *</span>
      <input
        type="text"
        value={brief[key]}
        onChange={(e) => patch({ [key]: e.target.value })}
        placeholder={placeholder}
        className="paper-input w-full"
        aria-required="true"
        aria-invalid={showRequired && missing}
      />
      {showRequired && missing && <span role="alert" className="text-xs text-error">{text} is required.</span>}
    </label>
  );

  const briefComplete = !projectMissing && !pagesMissing;
  const previewPrompt = briefComplete ? compileRecipePrompt(brief, mode, { zip: !canPick }) : '';
  const agentHint = DESIGN_AGENTS.find((a) => a.id === agent)?.hint;

  const stepNumber = (n: number) => (
    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-200 text-xs font-semibold">{n}</span>
  );

  return (
    <>
      <Modal isOpen onClose={busy ? () => {} : onClose} title={`Use recipe: ${recipeTitle}`} size="4xl">
        {/* Form, card and notices scroll in their own region; Close sits in a footer below it, so a notice can never run under it. */}
        <div className="flex max-h-[85vh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
        <fieldset disabled={busy} className="min-w-0 p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4 min-w-0">
          {requiredField('Project', 'project', 'e.g. Acme Analytics', projectMissing)}
          {requiredField('Pages / sections', 'pages', 'e.g. landing page: hero, features, pricing, footer', pagesMissing)}

          <details open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)} className="flex flex-col gap-3">
            <summary className={`${label} cursor-pointer`}>More</summary>
            <div className="flex flex-col gap-3 pt-3">
              {MORE_FIELDS.map(([key, text]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className={label}>{text}</span>
                  <textarea
                    value={brief[key] ?? ''}
                    onChange={(e) => patch({ [key]: e.target.value })}
                    rows={key === 'content' ? 4 : 2}
                    className="paper-input w-full"
                  />
                </label>
              ))}
            </div>
          </details>

          <fieldset className="flex flex-col gap-2">
            <legend className={label}>Mode</legend>
            {MODES.map((m) => (
              <label key={m.value} className="flex items-baseline gap-2 text-xs">
                <input type="radio" name="recipe-mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
                <span className="font-semibold">{m.title}</span>
                <span className="text-base-content/60">{m.hint}</span>
              </label>
            ))}
          </fieldset>
          </div>

          <section aria-label="For agents" className="paper-card flex flex-col gap-4 p-4 min-w-0 self-start">
            <h3 className="text-sm font-semibold">For agents</h3>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">{stepNumber(1)}Choose your agent</div>
              <div className="flex flex-wrap gap-2">
                {DESIGN_AGENTS.map((a) => (
                  <button key={a.id} type="button" className="paper-chip" aria-pressed={agent === a.id} onClick={() => pickAgent(a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-base-content/60">{agentHint}</p>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border-2 border-base-content p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">{stepNumber(2)}Send the instruction</div>
              <textarea
                readOnly
                value={previewPrompt}
                placeholder="Fill in project and pages to see the prompt"
                rows={10}
                aria-label="Prompt preview"
                className="paper-input w-full resize-none bg-base-200 font-sf-mono text-xs max-h-36 md:max-h-none"
              />
              <button type="button" className="paper-btn paper-btn-primary paper-btn-lg" onClick={() => void (canPick ? exportToFolder() : downloadZip())}>
                {busy ? 'Working…' : canPick ? 'Export files & copy prompt' : 'Download ZIP & copy prompt'}
              </button>
              <button type="button" className="paper-btn paper-btn-ghost" onClick={() => void copyOnly()}>Copy prompt only</button>
              <p className="text-xs text-base-content/60">Copy prompt only skips the files, so the agent will not see the screenshots.</p>
            </div>

            {!canPick && (
              <p role="status" className="text-xs text-base-content/60">
                This browser cannot write to a folder. The ZIP contains design/ (spec, references, brief, prompt): unzip it into your repo root.
              </p>
            )}
            {error && <p role="alert" className="paper-notice border border-error/30 bg-error/10 text-error break-words">{error}</p>}
            {notice && <p role="status" className="paper-notice border border-success/30 bg-success/10 text-success break-words">{notice}</p>}
            {fallbackPrompt && (
              <div className="flex flex-col gap-2">
                <textarea readOnly value={fallbackPrompt} rows={8} aria-label="Prompt" className="paper-input w-full font-sf-mono text-xs" />
                <div>
                  <button type="button" className="paper-btn" onClick={() => void copyFallback()}>Copy</button>
                </div>
              </div>
            )}
          </section>
        </fieldset>
        </div>
        <footer className="flex shrink-0 justify-end border-t border-base-content/10 px-4 py-3 md:px-6">
          <button type="button" className="paper-btn" disabled={busy} onClick={onClose}>Close</button>
        </footer>
        </div>
      </Modal>
      {pending && (
        <ConfirmationModal
          isOpen
          onClose={() => setPending(null)}
          onConfirm={confirmOverwrite}
          title="Overwrite design/"
          message={`Overwrite design/ in ${pending.root.name || CHOSEN_FOLDER}?`}
          heading="Overwrite existing files?"
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
        />
      )}
    </>
  );
};

export default UseRecipeModal;
