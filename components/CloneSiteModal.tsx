import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import CollectionSelect from './CollectionSelect';
import LoadingSpinner from './LoadingSpinner';
import { createRecipe } from '../utils/designLibraryStorage';
import { loadLLMSettings } from '../utils/settingsStorage';
import {
  captureSite,
  isNoVisionError,
  measuredRecipe,
  writeCloneSpec,
  type CapturedSite,
  type ClonedRecipe,
} from '../services/cloneSiteService';
import type { DesignCollection } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The new recipe's id and a note to show (e.g. "built from measurements only"). */
  onCreated: (recipeId: string, note: string | null) => void;
  collections: DesignCollection[];
  defaultCollectionId?: string;
}

type Phase =
  | { kind: 'idle'; error: string | null }
  | { kind: 'capturing' }
  | { kind: 'writing'; step: string }
  /** The capture worked but the model call failed with a retryable error; the capture is kept. */
  | { kind: 'aiFailed'; error: string }
  | { kind: 'saving' };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * "Clone a site": one public URL → the server captures and measures it → the active vision provider writes the
 * DESIGN.md → a complete recipe. Nothing from the site is downloaded except the screenshots of it.
 */
const CloneSiteModal: React.FC<Props> = ({ isOpen, onClose, onCreated, collections, defaultCollectionId }) => {
  const [url, setUrl] = useState('');
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle', error: null });
  const siteRef = useRef<CapturedSite | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setUrl('');
    setCollectionId(defaultCollectionId ?? '');
    setPhase({ kind: 'idle', error: null });
    siteRef.current = null;
  }, [isOpen, defaultCollectionId]);

  const busy = phase.kind === 'capturing' || phase.kind === 'writing' || phase.kind === 'saving';

  const save = async (recipe: ClonedRecipe, note: string | null) => {
    setPhase({ kind: 'saving' });
    try {
      const created = await createRecipe({
        title: recipe.title,
        pageType: recipe.pageType,
        tags: recipe.tags,
        sourceUrl: recipe.sourceUrl,
        collectionId: collectionId || undefined,
        refs: recipe.refs,
        spec: recipe.spec,
        clone: recipe.clone,
      });
      const truncatedNote = recipe.truncated ? 'The AI answer was cut off; check the spec before using it.' : null;
      onCreated(created.id, [note, truncatedNote].filter(Boolean).join(' ') || null);
      onClose();
    } catch (e) {
      if (mountedRef.current) setPhase({ kind: 'aiFailed', error: `Saving failed: ${errorText(e)}` });
    }
  };

  const writeSpec = async (site: CapturedSite) => {
    setPhase({ kind: 'writing', step: 'Writing the design spec…' });
    try {
      const recipe = await writeCloneSpec(site, loadLLMSettings(), (step) => { if (mountedRef.current) setPhase({ kind: 'writing', step }); });
      if (mountedRef.current) await save(recipe, null);
    } catch (e) {
      if (!mountedRef.current) return;
      // A provider that cannot read images will never succeed: build from the measurements instead of nagging.
      if (isNoVisionError(e)) await save(measuredRecipe(site), `Built from measurements only (${errorText(e)}) Use "Rewrite with AI" once a vision model is set.`);
      else setPhase({ kind: 'aiFailed', error: errorText(e) });
    }
  };

  const start = async () => {
    const target = url.trim();
    if (!target || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'capturing' });
    try {
      const site = await captureSite(/^https?:\/\//i.test(target) ? target : `https://${target}`, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      siteRef.current = site;
      await writeSpec(site);
    } catch (e) {
      if (mountedRef.current && !controller.signal.aborted) setPhase({ kind: 'idle', error: errorText(e) });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ kind: 'idle', error: null });
  };

  const site = siteRef.current;

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Clone a site" size="lg">
      <form
        className="p-6 flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void start(); }}
      >
        <p className="text-xs text-base-content/70">
          Kollektiv opens the page in its own sandboxed browser, measures it at desktop and mobile size and takes two screenshots.
          Nothing else is downloaded. The AI engine set in Settings then writes the full recipe; the clone export later recreates
          the site&apos;s look without copying its images or logos.
        </p>

        <label className="flex flex-col gap-1">
          <span className="paper-label">Website address</span>
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="paper-input w-full"
            disabled={busy || phase.kind === 'aiFailed'}
            autoFocus
          />
        </label>

        <CollectionSelect collections={collections} value={collectionId} onChange={setCollectionId} />

        {phase.kind === 'capturing' && (
          <p role="status" className="flex items-center gap-2 text-xs text-base-content/70">
            <LoadingSpinner size={14} /> Capturing and measuring the page (desktop, then mobile)… this takes 10–60 s.
          </p>
        )}
        {phase.kind === 'writing' && (
          <p role="status" className="flex items-center gap-2 text-xs text-base-content/70">
            <LoadingSpinner size={14} /> {phase.step}
          </p>
        )}
        {phase.kind === 'saving' && (
          <p role="status" className="flex items-center gap-2 text-xs text-base-content/70">
            <LoadingSpinner size={14} /> Saving the recipe…
          </p>
        )}
        {phase.kind === 'idle' && phase.error && <p role="alert" className="text-xs text-error break-words">{phase.error}</p>}
        {phase.kind === 'aiFailed' && (
          <div role="alert" className="paper-notice border border-error/30 bg-error/10 text-error break-words flex flex-col gap-2">
            <span>The page was captured, but writing the spec failed: {phase.error}</span>
            <span className="flex flex-wrap gap-2">
              <button type="button" className="paper-btn paper-btn-sm" onClick={() => { if (site) void writeSpec(site); }}>Retry AI</button>
              <button type="button" className="paper-btn paper-btn-sm" onClick={() => { if (site) void save(measuredRecipe(site), 'Built from measurements only.'); }}>
                Save from measurements only
              </button>
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {phase.kind === 'capturing' ? (
            <button type="button" className="paper-btn" onClick={cancel}>Cancel</button>
          ) : (
            <button type="button" className="paper-btn" onClick={onClose} disabled={busy}>Close</button>
          )}
          {phase.kind !== 'aiFailed' && (
            <button type="submit" className="paper-btn paper-btn-primary" disabled={busy || !url.trim()}>
              {busy ? 'Cloning…' : 'Clone site'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default CloneSiteModal;
