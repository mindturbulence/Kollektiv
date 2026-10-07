import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { createRecipe } from '../utils/designLibraryStorage';
import { emptyRecipeSpec, parseTags, RECIPE_PAGE_TYPES } from '../utils/designLibraryFilter';
import { normalizeRef } from '../utils/designImage';
import CollectionSelect from './CollectionSelect';
import type { DesignCollection, RecipePageType } from '../types';

export const MAX_RECIPE_REFS = 6;

interface RefEntry {
  key: string;
  name: string;
  blob: Blob;
  previewUrl: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the recipe is written; the caller refreshes its list. */
  onCreated: () => void;
  collections: DesignCollection[];
  /** Pre-selected collection each time the dialog opens (the sidebar selection); omitted = Unsorted. */
  defaultCollectionId?: string;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const DesignRecipeAddModal: React.FC<Props> = ({ isOpen, onClose, onCreated, collections, defaultCollectionId }) => {
  const [title, setTitle] = useState('');
  const [pageType, setPageType] = useState<RecipePageType>('landing');
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? '');
  const [tagsText, setTagsText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [refs, setRefs] = useState<RefEntry[]>([]);
  const [refErrors, setRefErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirrors `refs` so async ingest and cleanup see the latest list; `busy` serialises concurrent ingests (paste while converting).
  const refsRef = useRef<RefEntry[]>([]);
  const busyRef = useRef(false);
  const keyCounter = useRef(0);

  const commitRefs = useCallback((next: RefEntry[]) => {
    refsRef.current = next;
    setRefs(next);
  }, []);

  const revokeAll = useCallback(() => {
    for (const r of refsRef.current) URL.revokeObjectURL(r.previewUrl);
  }, []);

  // Reset on close (the component stays mounted so Modal can play its exit) and release previews on unmount.
  // The collection is re-seeded from the sidebar selection on every open and on every close, so a stale choice never survives.
  useEffect(() => {
    setCollectionId(defaultCollectionId ?? '');
    if (isOpen) return;
    revokeAll();
    commitRefs([]);
    setTitle(''); setPageType('landing'); setTagsText(''); setSourceUrl('');
    setRefErrors([]); setSubmitError(null); setSaving(false); setDragging(false);
  }, [isOpen, defaultCollectionId, revokeAll, commitRefs]);
  useEffect(() => revokeAll, [revokeAll]);

  const addFiles = useCallback(async (files: File[]) => {
    if (busyRef.current || files.length === 0) return;
    busyRef.current = true;
    const errors: string[] = [];
    try {
      let next = refsRef.current;
      for (const file of files) {
        if (next.length >= MAX_RECIPE_REFS) {
          errors.push(`Only ${MAX_RECIPE_REFS} reference images are allowed; skipped ${file.name || 'image'}.`);
          break;
        }
        try {
          const blob = await normalizeRef(file);
          next = [...next, { key: `ref${keyCounter.current++}`, name: file.name || 'image', blob, previewUrl: URL.createObjectURL(blob) }];
          commitRefs(next);
        } catch (e) {
          errors.push(`${file.name || 'image'}: ${errorText(e)}`);
        }
      }
    } finally {
      busyRef.current = false;
      setRefErrors(errors);
    }
  }, [commitRefs]);

  // Clipboard paste while the dialog is open: take image items only, leave text paste to the focused input.
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, addFiles]);

  const removeRef = (key: string) => {
    const gone = refsRef.current.find((r) => r.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    commitRefs(refsRef.current.filter((r) => r.key !== key));
  };

  const trimmedTitle = title.trim();
  const canSubmit = !saving && trimmedTitle.length > 0 && refs.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await createRecipe({
        title: trimmedTitle,
        pageType,
        collectionId: collectionId || undefined,
        tags: parseTags(tagsText),
        sourceUrl: sourceUrl.trim() || undefined,
        refs: refs.map(({ name, blob }) => ({ name, blob })),
        spec: emptyRecipeSpec(trimmedTitle),
      });
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(errorText(err));
      setSaving(false);
    }
  };

  const label = 'paper-label';

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="Add recipe" size="xl">
      <form onSubmit={(e) => void handleSubmit(e)} className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <label className="flex flex-col gap-1">
          <span className={label}>Title</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stripe landing" className="paper-input w-full" required />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className={label}>Page type</span>
            <select
              value={pageType}
              onChange={(e) => { const t = RECIPE_PAGE_TYPES.find((p) => p === e.target.value); if (t) setPageType(t); }}
              className="paper-input w-full"
            >
              {RECIPE_PAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Tags (comma separated)</span>
            <input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="saas, dark, minimal" className="paper-input w-full" />
          </label>
        </div>

        <CollectionSelect collections={collections} value={collectionId} onChange={setCollectionId} />

        <label className="flex flex-col gap-1">
          <span className={label}>Source URL (optional)</span>
          <input type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" className="paper-input w-full" />
        </label>

        <div className="flex flex-col gap-2">
          <span className={label}>Reference images ({refs.length}/{MAX_RECIPE_REFS})</span>
          <div
            data-testid="ref-dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
            className={`flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors duration-fast ${dragging ? 'border-primary bg-primary/10' : 'border-base-content/20'}`}
          >
            <p className="text-xs text-base-content/60">Paste a screenshot (Ctrl+V), drop images here, or</p>
            <button type="button" className="paper-btn" onClick={() => fileInputRef.current?.click()} disabled={refs.length >= MAX_RECIPE_REFS}>
              Choose files
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
          </div>
          {refErrors.map((msg) => <p key={msg} role="alert" className="text-xs text-error">{msg}</p>)}
          {refs.length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {refs.map((r) => (
                <li key={r.key} className="relative aspect-square bg-base-200 overflow-hidden rounded-lg">
                  <img src={r.previewUrl} alt={r.name} className="w-full h-full object-cover object-top" />
                  <button
                    type="button"
                    onClick={() => removeRef(r.key)}
                    aria-label={`Remove ${r.name}`}
                    className="paper-btn paper-btn-danger paper-btn-icon absolute top-1 right-1"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {submitError && <p role="alert" className="text-xs text-error break-words">{submitError}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="paper-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="paper-btn paper-btn-primary" disabled={!canSubmit}>
            {saving ? 'Saving…' : 'Add recipe'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default DesignRecipeAddModal;
