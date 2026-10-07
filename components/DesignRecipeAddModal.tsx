import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { createRecipe } from '../utils/designLibraryStorage';
import { emptyRecipeSpec, parseTags, RECIPE_PAGE_TYPES } from '../utils/designLibraryFilter';
import { normalizeRef } from '../utils/designImage';
import CollectionSelect from './CollectionSelect';
import LoadingSpinner from './LoadingSpinner';
import type { DesignCollection, RecipePageType } from '../types';
import type { CaptureErrorCode, CaptureSiteResponse } from '../src/schemas/captureSite';

export const MAX_RECIPE_REFS = 6;

export const CAPTURE_ERROR_TEXT: Record<CaptureErrorCode, string> = {
  invalid_url: 'Enter a full http:// or https:// address.',
  blocked_host: 'That address is local or private, so it cannot be captured.',
  forbidden_origin: 'The request was refused by the server.',
  too_large: 'The screenshot is too large (over 8 MB). Paste a screenshot instead.',
  rate_limited: 'Too many captures in a minute. Wait a moment and try again.',
  busy: 'Another capture is still running. Try again when it finishes.',
  capture_failed: 'The capture failed. Try again, or paste a screenshot instead.',
  unreachable: 'The page could not be loaded. Check the address.',
  capture_unavailable: 'No Chrome, Chromium or Edge is available on the server, so pages cannot be captured.',
  timeout: 'The page took too long to load (30 s limit).',
};
// The server's own text is more specific for these (which rule failed, what to install).
const SERVER_DETAIL_CODES: ReadonlySet<CaptureErrorCode> = new Set(['invalid_url', 'blocked_host', 'capture_unavailable']);

const pngFile = (base64: string, name: string): File => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'image/png' });
};

const captureName = (finalUrl: string): string => {
  try { return `${new URL(finalUrl).hostname}.png`; } catch { return 'capture.png'; }
};

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
  const [captureUrl, setCaptureUrl] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const captureAbortRef = useRef<AbortController | null>(null);
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
    captureAbortRef.current?.abort();
    setTitle(''); setPageType('landing'); setTagsText(''); setSourceUrl('');
    setRefErrors([]); setSubmitError(null); setSaving(false); setDragging(false);
    setCaptureUrl(''); setCapturing(false); setCaptureError(null);
  }, [isOpen, defaultCollectionId, revokeAll, commitRefs]);
  useEffect(() => () => { revokeAll(); captureAbortRef.current?.abort(); }, [revokeAll]);

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

  const captureSite = async () => {
    const url = captureUrl.trim();
    if (!url || capturing || saving || refsRef.current.length >= MAX_RECIPE_REFS) return;
    const controller = new AbortController();
    captureAbortRef.current = controller;
    setCapturing(true);
    setCaptureError(null);
    try {
      let data: CaptureSiteResponse;
      try {
        const res = await fetch('/api/capture-site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        data = await res.json();
      } catch {
        if (!controller.signal.aborted) setCaptureError('Could not reach the Kollektiv server.');
        return;
      }
      if (controller.signal.aborted) return;
      if (!data.ok) {
        // Responses from outer middleware (e.g. the global origin guard) carry no `code`.
        const known = data.code in CAPTURE_ERROR_TEXT;
        setCaptureError(
          known && SERVER_DETAIL_CODES.has(data.code) && data.error ? data.error
            : known ? CAPTURE_ERROR_TEXT[data.code]
              : 'The capture failed.',
        );
        return;
      }
      // Never overwrite a source URL the user typed (including while the capture ran).
      setSourceUrl((cur) => (cur.trim() ? cur : data.finalUrl));
      setCaptureUrl('');
      // addFiles ignores calls while a paste/drop is still converting; wait for it instead of dropping the capture.
      while (busyRef.current) await new Promise((r) => setTimeout(r, 50));
      if (controller.signal.aborted) return;
      await addFiles([pngFile(data.imageBase64, captureName(data.finalUrl))]);
    } finally {
      if (captureAbortRef.current === controller) {
        captureAbortRef.current = null;
        if (!controller.signal.aborted) setCapturing(false);
      }
    }
  };

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
          <div className="flex gap-2">
            <input
              type="url"
              value={captureUrl}
              onChange={(e) => setCaptureUrl(e.target.value)}
              // Enter would submit the recipe form; capture instead.
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void captureSite(); } }}
              placeholder="Import from site: https://example.com"
              aria-label="Import from site URL"
              className="paper-input flex-1 min-w-0"
              disabled={saving || capturing}
            />
            <button
              type="button"
              className="paper-btn inline-flex items-center gap-2"
              onClick={() => void captureSite()}
              disabled={saving || capturing || !captureUrl.trim() || refs.length >= MAX_RECIPE_REFS}
            >
              {capturing && <LoadingSpinner size={14} />}
              {capturing ? 'Capturing…' : 'Capture'}
            </button>
          </div>
          {captureError && <p role="alert" className="text-xs text-error break-words">{captureError}</p>}
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
