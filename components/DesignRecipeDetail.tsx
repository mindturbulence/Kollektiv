import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import type { DesignCollection, DesignRecipe, RecipePageType } from '../types';
import {
  addRecipeRefs,
  loadDesignLibrary,
  loadRecipeSpec,
  removeRecipeRef,
  reorderRecipeRefs,
  updateRecipe,
} from '../utils/designLibraryStorage';
import { parseTags, RECIPE_PAGE_TYPES } from '../utils/designLibraryFilter';
import { normalizeRef } from '../utils/designImage';
import { DESIGN_HEADINGS, type DesignSpec } from '../utils/designSpec';
import {
  compactSections,
  findEmptyTokens,
  findEstimated,
  missingFrontMatter,
  otherToYaml,
  parseOtherTokens,
  rebuildFrontMatter,
  sectionDrafts,
  splitFrontMatter,
  validateColors,
  type ColorRow,
} from '../utils/designSpecForm';
import { audioService } from '../services/audioService';
import { extractDesignSpec, MAX_EXTRACT_REFS } from '../services/designSpecService';
import { fileSystemManager } from '../utils/fileUtils';
import { loadLLMSettings } from '../utils/settingsStorage';
import EmptyState from './EmptyState';
import CollectionSelect from './CollectionSelect';
import ConfirmationModal from './ConfirmationModal';
import RecipeThumb from './RecipeThumb';
import UseRecipeModal from './UseRecipeModal';
import { MAX_RECIPE_REFS } from './DesignRecipeAddModal';

interface Props {
  recipeId: string;
  onBack: () => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recipe: DesignRecipe; collections: DesignCollection[]; spec: DesignSpec; truncated: boolean; safeToSave: boolean };

interface Draft {
  title: string;
  pageType: RecipePageType;
  /** '' = Unsorted (also for a collectionId whose collection no longer exists). */
  collectionId: string;
  tagsText: string;
  sourceUrl: string;
  /** null = `colors` is not a flat name -> string map and is edited in the YAML box instead. */
  colors: ColorRow[] | null;
  yaml: string;
  sections: Record<string, string>;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const labelClass = 'paper-label';

const toDraft = (recipe: DesignRecipe, collections: DesignCollection[], spec: DesignSpec): Draft => {
  const { colors, other } = splitFrontMatter(spec.frontMatter);
  return {
    title: recipe.title,
    pageType: recipe.pageType,
    collectionId: recipe.collectionId && collections.some((c) => c.id === recipe.collectionId) ? recipe.collectionId : '',
    tagsText: recipe.tags.join(', '),
    sourceUrl: recipe.sourceUrl ?? '',
    colors,
    yaml: otherToYaml(other),
    sections: sectionDrafts(spec.sections),
  };
};

interface EditorProps extends Props {
  recipe: DesignRecipe;
  collections: DesignCollection[];
  spec: DesignSpec;
  truncated: boolean;
  safeToSave: boolean;
}

const Editor: React.FC<EditorProps> = ({ recipe, collections, spec, truncated: loadedTruncated, safeToSave, onBack, showGlobalFeedback }) => {
  const [saved, setSaved] = useState<Draft>(() => toDraft(recipe, collections, spec));
  const [draft, setDraft] = useState<Draft>(saved);
  const [colorsAt, setColorsAt] = useState(() => splitFrontMatter(spec.frontMatter).colorsAt);
  const [truncated, setTruncated] = useState(loadedTruncated);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refs, setRefs] = useState<string[]>(recipe.refs);
  const [refErrors, setRefErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [useOpen, setUseOpen] = useState(false);
  /** Progress text while an extraction runs, else null. */
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  /** Outcome of the last extraction applied to the draft (cleared by Save). */
  const [extracted, setExtracted] = useState<{ truncated: boolean; missing: string[] } | null>(null);
  const [stripped, setStripped] = useState<string[]>([]);
  const [confirmExtract, setConfirmExtract] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref ops and Save all read-modify-write the manifest, so only one may run at a time.
  const busyRef = useRef(false);
  const refsRef = useRef(refs);
  // A result that arrives after the user left this view is dropped.
  const mountedRef = useRef(true);
  // The draft exactly as the last extraction left it: re-running over it needs no confirmation.
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const commitRefs = (next: DesignRecipe) => {
    refsRef.current = next.refs;
    setRefs(next.refs);
  };

  const refOp = (op: () => Promise<DesignRecipe>) =>
    withBusy(async () => {
      try {
        commitRefs(await op());
        setRefErrors([]);
      } catch (e) {
        setRefErrors([errorText(e)]);
      }
    });

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return Promise.resolve();
    return withBusy(async () => {
      const errors: string[] = [];
      const ready: { name: string; blob: Blob }[] = [];
      const room = MAX_RECIPE_REFS - refsRef.current.length;
      for (const file of files) {
        const name = file.name || 'image';
        if (ready.length >= room) {
          errors.push(`Only ${MAX_RECIPE_REFS} reference images are allowed; skipped ${name}.`);
          break;
        }
        try {
          ready.push({ name, blob: await normalizeRef(file) });
        } catch (e) {
          errors.push(`${name}: ${errorText(e)}`);
        }
      }
      if (ready.length > 0) {
        try {
          const next = await addRecipeRefs(recipe.id, ready);
          refsRef.current = next.refs;
          setRefs(next.refs);
        } catch (e) {
          errors.push(errorText(e));
        }
      }
      setRefErrors(errors);
    });
  }, [recipe.id, withBusy]);

  // Clipboard paste while this view is mounted: image items only, text paste stays with the focused field.
  useEffect(() => {
    if (!safeToSave) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [safeToSave, addFiles]);

  const move = (i: number, dir: -1 | 1) => {
    audioService.playClick();
    const next = [...refs];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    void refOp(() => reorderRecipeRefs(recipe.id, next));
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setColor = (i: number, p: Partial<ColorRow>) =>
    setDraft((d) => (d.colors ? { ...d, colors: d.colors.map((r, j) => (j === i ? { ...r, ...p } : r)) } : d));

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const other = useMemo(() => parseOtherTokens(draft.yaml, draft.colors !== null), [draft.yaml, draft.colors]);
  const colorError = draft.colors ? validateColors(draft.colors) : null;
  const titleOk = draft.title.trim().length > 0;
  // A cut-off extraction may not be saved until it is re-run or Signature is written by hand.
  const extractBlocksSave = !!extracted?.truncated && !draft.sections.Signature?.trim();
  const canSave = dirty && safeToSave && !busy && titleOk && other.ok && !colorError && !extractBlocksSave;

  const frontMatter = useMemo(
    () => (other.ok ? rebuildFrontMatter({ colors: draft.colors, other: other.value, colorsAt }) : null),
    [other, draft.colors, colorsAt],
  );
  const estimated = frontMatter ? findEstimated(frontMatter) : [];
  const missingTokens = frontMatter ? missingFrontMatter(frontMatter) : [];
  const emptyTokens = frontMatter ? findEmptyTokens(frontMatter) : [];

  const emptyCount = DESIGN_HEADINGS.filter((h) => !draft.sections[h].trim()).length;

  const handleSave = () => {
    if (!canSave || !frontMatter) return;
    void withBusy(async () => {
      setSaveError(null);
      const title = draft.title.trim();
      const tags = parseTags(draft.tagsText);
      const sourceUrl = draft.sourceUrl.trim();
      const sections = compactSections(draft.sections);
      try {
        await updateRecipe(
          recipe.id,
          { title, pageType: draft.pageType, collectionId: draft.collectionId || undefined, tags, sourceUrl: sourceUrl || undefined },
          { frontMatter, sections },
        );
      } catch (e) {
        setSaveError(errorText(e));
        return;
      }
      // The form is disabled while busy, so `draft` cannot have changed since this save started.
      const next: Draft = { ...draft, title, tagsText: tags.join(', '), sourceUrl };
      setSaved(next);
      setDraft(next);
      setTruncated(!sections.Signature);
      setExtracted(null);
      showGlobalFeedback('Recipe saved');
    });
  };

  const runExtract = () =>
    withBusy(async () => {
      setExtractError(null);
      setExtracting('Loading references…');
      try {
        const blobs = await Promise.all(refsRef.current.slice(0, MAX_EXTRACT_REFS).map(async (path) => {
          const blob = await fileSystemManager.getFileAsBlob(path);
          if (!blob) throw new Error(`Reference image is missing on disk: ${path}`);
          return blob;
        }));
        const result = await extractDesignSpec(blobs, loadLLMSettings(), (step) => { if (mountedRef.current) setExtracting(step); });
        if (!mountedRef.current) return;
        const split = splitFrontMatter(result.spec.frontMatter);
        // The form is disabled while busy, so `draft` cannot have changed since this run started.
        const next: Draft = { ...draft, colors: split.colors, yaml: otherToYaml(split.other), sections: sectionDrafts(result.spec.sections) };
        appliedRef.current = JSON.stringify(next);
        setDraft(next);
        setColorsAt(split.colorsAt);
        setTruncated(false);
        setExtracted({ truncated: result.truncated, missing: result.missing });
        setStripped(result.stripped);
      } catch (e) {
        if (mountedRef.current) setExtractError(errorText(e));
      } finally {
        if (mountedRef.current) setExtracting(null);
      }
    });

  const hasSpecContent =
    Object.values(draft.sections).some((t) => t.trim()) ||
    (draft.colors?.length ?? 0) > 0 ||
    !other.ok ||
    Object.keys(other.value).some((k) => k !== 'name');

  const requestExtract = () => {
    audioService.playClick();
    const untouchedResult = appliedRef.current === JSON.stringify(draft);
    if (!untouchedResult && (dirty || hasSpecContent)) setConfirmExtract(true);
    else void runExtract();
  };

  const handleBack = () => {
    audioService.playClick();
    if (dirty) setConfirmBack(true);
    else onBack();
  };

  const atCap = refs.length >= MAX_RECIPE_REFS;

  return (
    <section className="flex flex-col h-full w-full relative overflow-hidden">
      <div className="relative z-raised flex-1 flex flex-col h-full min-w-0">
        <div className="flex flex-col h-full w-full relative overflow-hidden">
          <div className="h-full w-full overflow-y-auto">
            <fieldset disabled={busy} className="contents">
              <header className="sticky top-0 z-raised bg-base-100/90 backdrop-blur-xl border-b border-base-content/10 px-4 md:px-6 py-3 flex items-center gap-3">
                <button type="button" className="paper-btn" onClick={handleBack}>← Back</button>
                <h1 className="paper-title flex-1 text-base truncate">{draft.title || 'Untitled recipe'}</h1>
                {dirty && <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-2xs font-medium text-warning">Unsaved</span>}
                <button
                  type="button"
                  className="paper-btn"
                  disabled={dirty}
                  title={dirty ? 'Save your changes first: the export uses the saved recipe' : undefined}
                  onClick={() => { audioService.playClick(); setUseOpen(true); }}
                >
                  Use recipe
                </button>
                <button type="button" className="paper-btn paper-btn-primary" disabled={!canSave} onClick={handleSave}>
                  {busy ? 'Working…' : 'Save'}
                </button>
              </header>

              <div className="p-4 md:p-6 flex flex-col gap-8 max-w-5xl">
                {!safeToSave && (
                  <p role="status" className="paper-notice border border-warning/30 bg-warning/10 text-warning">
                    The library manifest could not be read safely, so this recipe is read-only. Reconnect your vault or restore the manifest, then reload.
                  </p>
                )}
                {saveError && <p role="alert" className="paper-notice border border-error/30 bg-error/10 text-error break-words">Could not save: {saveError}</p>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className={labelClass}>Title</span>
                    <input type="text" value={draft.title} onChange={(e) => patch({ title: e.target.value })} className="paper-input w-full" aria-invalid={!titleOk} />
                    {!titleOk && <span className="text-xs text-error">A title is required.</span>}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Page type</span>
                    <select
                      value={draft.pageType}
                      onChange={(e) => { const t = RECIPE_PAGE_TYPES.find((p) => p === e.target.value); if (t) patch({ pageType: t }); }}
                      className="paper-input w-full"
                    >
                      {RECIPE_PAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <CollectionSelect collections={collections} value={draft.collectionId} onChange={(collectionId) => patch({ collectionId })} className="md:col-span-2" />
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Tags (comma separated)</span>
                    <input type="text" value={draft.tagsText} onChange={(e) => patch({ tagsText: e.target.value })} className="paper-input w-full" />
                  </label>
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className={labelClass}>Source URL (text only)</span>
                    <input type="text" value={draft.sourceUrl} onChange={(e) => patch({ sourceUrl: e.target.value })} placeholder="https://" className="paper-input w-full" />
                  </label>
                </div>

                <section aria-labelledby="refs-heading" className="flex flex-col gap-2">
                  <h2 id="refs-heading" className={labelClass}>References ({refs.length}/{MAX_RECIPE_REFS})</h2>
                  <p className="text-xs text-base-content/60">Changes to references apply immediately and are not part of Save.</p>
                  <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {refs.map((path, i) => (
                      <li key={path} className="flex flex-col gap-1">
                        <div className="aspect-video bg-base-200 overflow-hidden rounded-lg border border-base-content/10">
                          <RecipeThumb path={path} title={`Reference ${i + 1}`} />
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className="paper-btn paper-btn-sm" aria-label={`Move reference ${i + 1} left`} disabled={i === 0 || !safeToSave} onClick={() => move(i, -1)}>←</button>
                          <button type="button" className="paper-btn paper-btn-sm" aria-label={`Move reference ${i + 1} right`} disabled={i === refs.length - 1 || !safeToSave} onClick={() => move(i, 1)}>→</button>
                          <button type="button" className="paper-btn paper-btn-sm paper-btn-danger ml-auto" aria-label={`Remove reference ${i + 1}`} title={refs.length <= 1 ? "A recipe needs at least one reference" : undefined} disabled={!safeToSave || refs.length <= 1} onClick={() => setToRemove(path)}>✕</button>
                        </div>
                      </li>
                    ))}
                    <li className="flex items-center justify-center aspect-video rounded-lg border border-dashed border-base-content/20 text-center p-2">
                      <button type="button" className="paper-btn" disabled={atCap || !safeToSave} onClick={() => fileInputRef.current?.click()}>
                        {atCap ? 'Maximum reached' : 'Add (or paste)'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        data-testid="ref-file-input"
                        onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
                      />
                    </li>
                  </ul>
                  {refErrors.map((msg) => <p key={msg} role="alert" className="text-xs text-error break-words">{msg}</p>)}
                </section>

                <section aria-label="Extract from screens" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="paper-btn paper-btn-primary"
                      disabled={!safeToSave || refs.length === 0}
                      onClick={requestExtract}
                    >
                      Extract from screens
                    </button>
                    {extracting && (
                      <span role="status" className="flex items-center gap-2 text-xs text-base-content/60">
                        <ThinkingOrb state="working" size={20} />
                        {extracting}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-base-content/60">
                    Drafts tokens and body from the screenshots with the AI engine set in Settings. Review, then Save.
                    {refs.length > MAX_EXTRACT_REFS && ` Reads the first ${MAX_EXTRACT_REFS} references.`}
                  </p>
                  {extractError && <p role="alert" className="paper-notice border border-error/30 bg-error/10 text-error break-words">Extraction failed: {extractError}</p>}
                  {extractBlocksSave && extracted && (
                    <div role="status" className="paper-notice flex flex-wrap items-center gap-3 border border-warning/30 bg-warning/10 text-warning">
                      <span className="flex-1 min-w-0">
                        The model's answer was cut off (missing: {extracted.missing.join(', ') || 'Signature'}). Save is blocked until you re-run or write the Signature section yourself.
                      </span>
                      <button type="button" className="paper-btn paper-btn-sm" onClick={requestExtract}>Re-run</button>
                    </div>
                  )}
                  {stripped.length > 0 && (
                    <div role="status" className="paper-notice flex items-start gap-3 border border-info/30 bg-info/10 text-info">
                      <span className="flex-1 min-w-0 break-words">Removed "(est.)" guess markers from: {stripped.join(', ')}. Check these values against the screenshots.</span>
                      <button type="button" className="paper-btn paper-btn-sm paper-btn-ghost" aria-label="Dismiss note" onClick={() => setStripped([])}>✕</button>
                    </div>
                  )}
                </section>

                <section aria-labelledby="tokens-heading" className="flex flex-col gap-4">
                  <h2 id="tokens-heading" className={labelClass}>Tokens</h2>
                  {draft.colors && (
                    <div className="flex flex-col gap-2">
                      <span className={labelClass}>Colors</span>
                      {draft.colors.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="text" aria-label={`Color name ${i + 1}`} value={row.name} onChange={(e) => setColor(i, { name: e.target.value })} className="paper-input flex-1 min-w-0" />
                          <input type="text" aria-label={`Color value ${i + 1}`} value={row.value} onChange={(e) => setColor(i, { value: e.target.value })} className="paper-input w-32 font-sf-mono" />
                          <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-lg border border-base-content/20" style={{ backgroundColor: row.value }} />
                          <button type="button" className="paper-btn paper-btn-sm paper-btn-danger" aria-label={`Remove color ${i + 1}`} onClick={() => patch({ colors: draft.colors && draft.colors.filter((_, j) => j !== i) })}>✕</button>
                        </div>
                      ))}
                      <div>
                        <button type="button" className="paper-btn" onClick={() => patch({ colors: [...(draft.colors ?? []), { name: '', value: '' }] })}>Add color</button>
                      </div>
                      {colorError && <p role="alert" className="text-xs text-error">{colorError}</p>}
                    </div>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Other tokens (YAML){draft.colors === null ? ' — includes colors, which is not a flat name/hex map' : ''}</span>
                    <textarea
                      value={draft.yaml}
                      onChange={(e) => patch({ yaml: e.target.value })}
                      rows={12}
                      spellCheck={false}
                      aria-invalid={!other.ok}
                      className="paper-input w-full font-sf-mono text-xs"
                    />
                  </label>
                  {!other.ok && <p role="alert" className="text-xs text-error break-words">Invalid YAML: {other.error}</p>}
                  {estimated.length > 0 && (
                    <p role="status" className="text-xs text-warning">Token values contain "(est.)" and will not be valid CSS: {estimated.join(', ')}</p>
                  )}
                  {emptyTokens.length > 0 && (
                    <p role="status" className="text-xs text-warning">Token values are empty (an unquoted #hex in YAML reads as a comment; quote it): {emptyTokens.join(', ')}</p>
                  )}
                  {missingTokens.length > 0 && (
                    <p role="status" className="text-xs text-warning">Missing front matter keys: {missingTokens.join(', ')}</p>
                  )}
                </section>

                <section aria-labelledby="body-heading" className="flex flex-col gap-4">
                  <div className="flex items-baseline gap-3">
                    <h2 id="body-heading" className={labelClass}>Body</h2>
                    <span className="text-xs text-base-content/60">{emptyCount === 0 ? 'All sections filled' : `${emptyCount} ${emptyCount === 1 ? 'section' : 'sections'} empty/missing`}</span>
                  </div>
                  {truncated && !draft.sections.Signature?.trim() && (
                    <p role="status" className="paper-notice border border-warning/30 bg-warning/10 text-warning">
                      Signature is missing — the draft may have been cut off.
                    </p>
                  )}
                  {Object.entries(draft.sections).map(([heading, text]) => (
                    <label key={heading} className="flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className={labelClass}>{heading}</span>
                        {!text.trim() && <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-warning">missing</span>}
                      </span>
                      <textarea
                        value={text}
                        onChange={(e) => setDraft((d) => ({ ...d, sections: { ...d.sections, [heading]: e.target.value } }))}
                        rows={5}
                        className="paper-input w-full"
                      />
                    </label>
                  ))}
                </section>
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      {useOpen && (
        <UseRecipeModal recipeId={recipe.id} recipeTitle={saved.title} onClose={() => setUseOpen(false)} showGlobalFeedback={showGlobalFeedback} />
      )}
      {confirmBack && (
        <ConfirmationModal
          isOpen
          onClose={() => setConfirmBack(false)}
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          title="Unsaved changes"
          message="Discard your unsaved edits and go back?"
          heading="Discard unsaved changes?"
          confirmLabel="Discard changes"
          cancelLabel="Cancel"
        />
      )}
      {confirmExtract && (
        <ConfirmationModal
          isOpen
          onClose={() => setConfirmExtract(false)}
          onConfirm={() => { setConfirmExtract(false); void runExtract(); }}
          title="Replace spec"
          message="Replace the tokens and body with a new extraction from the screenshots? Your current edits here are lost; the saved recipe stays as it is until you press Save."
          heading="Replace the spec?"
          confirmLabel="Replace spec"
          cancelLabel="Cancel"
        />
      )}
      {toRemove && (
        <ConfirmationModal
          isOpen
          onClose={() => setToRemove(null)}
          onConfirm={() => { const path = toRemove; setToRemove(null); void refOp(() => removeRecipeRef(recipe.id, path)); }}
          title="Remove reference"
          message="Permanently delete this screenshot from the recipe?"
          heading="Remove this reference?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
        />
      )}
    </section>
  );
};

const DesignRecipeDetail: React.FC<Props> = (props) => {
  const { recipeId, onBack } = props;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    (async () => {
      try {
        const { recipes, collections, safeToSave } = await loadDesignLibrary();
        const recipe = recipes.find((r) => r.id === recipeId);
        if (!recipe) throw new Error(`Design recipe not found: ${recipeId}`);
        const { spec, truncated } = await loadRecipeSpec(recipeId);
        if (active) setState({ status: 'ready', recipe, collections, spec, truncated, safeToSave });
      } catch (e) {
        if (active) setState({ status: 'error', message: errorText(e) });
      }
    })();
    return () => { active = false; };
  }, [recipeId]);

  if (state.status === 'loading') {
    return <div className="h-full w-full flex items-center justify-center bg-transparent"><ThinkingOrb state="working" size={64} /></div>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState
          icon="◨"
          title="Recipe unavailable"
          body={`This recipe could not be opened. Its DESIGN.md may be missing or hand-edited into an invalid shape, or the vault is not connected. (${state.message})`}
          action={{ label: 'Back', onClick: onBack }}
        />
      </div>
    );
  }

  return <Editor {...props} recipe={state.recipe} collections={state.collections} spec={state.spec} truncated={state.truncated} safeToSave={state.safeToSave} />;
};

export default DesignRecipeDetail;
