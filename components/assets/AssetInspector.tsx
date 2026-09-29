import React, { useEffect, useState } from 'react';
import {
  COLOR_LABELS, addToCollection, createCollection, createStack, removeFromCollection, unstack, updateMeta,
  type AssetMeta, type ColorLabel, type LibraryData,
} from '../../services/assets/assetLibrary';
import type { AssetEntry } from '../../services/assets/assetFilter';
import { canWriteMetadata } from '../../services/assets/metadataWriter';
import { LABEL_COLORS } from './FilterBar';

const btn = 'h-7 px-2 text-2xs font-mono uppercase border border-base-content/15 text-base-content/70 hover:text-primary hover:border-primary transition-colors disabled:opacity-40 disabled:pointer-events-none';
const fmtSize = (n?: number) => (n === undefined ? '—' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const Stars: React.FC<{ value: number; onSet: (r: number) => void }> = ({ value, onSet }) => (
  <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
    {[1, 2, 3, 4, 5].map(r => (
      <button key={r} type="button" role="radio" aria-checked={value === r} aria-label={`${r} star${r > 1 ? 's' : ''}`}
        className={`text-lg leading-none ${r <= value ? 'text-warning' : 'text-base-content/25 hover:text-base-content/60'}`}
        onClick={() => onSet(value === r ? 0 : r)}>★</button>
    ))}
  </div>
);

/**
 * Right-hand inspector (plan Tasks 8, 10–12, 22): the focused asset's facts
 * and EXIF, and editable rating / label / tags / caption / copyright stored in
 * the index. With several assets selected, the same controls apply to all.
 */
const AssetInspector: React.FC<{
  entries: AssetEntry[];
  library: LibraryData;
  vocabulary: string[];
  canRename: boolean;
  busy: boolean;
  onRename: () => void;
  onCopyMove: () => void;
  onWriteMetadata: () => void;
  onClose: () => void;
}> = ({ entries, library, vocabulary, canRename, busy, onRename, onCopyMove, onWriteMetadata, onClose }) => {
  const ids = entries.map(e => e.file.id);
  const single = entries.length === 1 ? entries[0] : null;
  const meta: AssetMeta = single ? (library.assets[single.file.id] ?? {}) : {};
  const [tagInput, setTagInput] = useState('');
  const [caption, setCaption] = useState(meta.caption ?? '');
  const [copyright, setCopyright] = useState(meta.copyright ?? '');
  const [collectionName, setCollectionName] = useState('');
  useEffect(() => { setCaption(meta.caption ?? ''); setCopyright(meta.copyright ?? ''); }, [single?.file.id, meta.caption, meta.copyright]);

  // Shared values across a multi-selection (shown when all agree).
  const all = entries.map(e => library.assets[e.file.id] ?? {});
  const common = <K extends keyof AssetMeta>(k: K) => (all.every(m => m[k] === all[0]?.[k]) ? all[0]?.[k] : undefined);
  const rating = (common('rating') as number | undefined) ?? 0;
  const label = common('label') as ColorLabel | undefined;
  const tagCounts = new Map<string, number>();
  all.forEach(m => m.tags?.forEach(t => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const tags = [...tagCounts.entries()].map(([t, n]) => ({ t, partial: n < all.length }));
  const stack = library.stacks.find(s => ids.some(id => s.ids.includes(id)));
  const inCollections = library.collections.filter(c => ids.every(id => c.ids.includes(id)));

  const addTags = (raw: string) => {
    const add = raw.split(',').map(t => t.trim()).filter(Boolean);
    if (!add.length) return;
    updateMeta(ids, m => ({ ...m, tags: [...new Set([...(m.tags ?? []), ...add])] }));
    setTagInput('');
  };
  const writable = entries.length > 0 && entries.every(e => canWriteMetadata(e.file.ext));

  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-l border-base-content/10 bg-base-100/60 overflow-y-auto" aria-label="Asset details">
      <div className="p-3 flex items-center justify-between border-b border-base-content/10">
        <span className="text-2xs font-mono font-black uppercase text-primary truncate">{single ? single.file.name : `${entries.length} selected`}</span>
        <button type="button" aria-label="Close details" className="text-base-content/60 hover:text-error" onClick={onClose}>✕</button>
      </div>

      {single && (
        <dl className="p-3 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-2xs font-mono border-b border-base-content/10">
          <dt className="text-base-content/50 uppercase">Path</dt><dd className="truncate" title={single.file.path}>{single.file.path}</dd>
          <dt className="text-base-content/50 uppercase">Size</dt><dd>{fmtSize(single.facts?.size)}</dd>
          <dt className="text-base-content/50 uppercase">Pixels</dt>
          <dd>{single.facts?.width ? `${single.facts.width} × ${single.facts.height}${single.facts.fromPreview ? ' (preview)' : ''}` : '—'}</dd>
          <dt className="text-base-content/50 uppercase">Modified</dt><dd>{single.facts?.mtime ? new Date(single.facts.mtime).toLocaleString() : '—'}</dd>
          {single.facts?.exif && Object.entries({
            Camera: [single.facts.exif.make, single.facts.exif.model].filter(Boolean).join(' '),
            Lens: single.facts.exif.lens, Taken: single.facts.exif.taken,
            Exposure: [single.facts.exif.exposure, single.facts.exif.fNumber && `f/${single.facts.exif.fNumber}`, single.facts.exif.iso && `ISO ${single.facts.exif.iso}`, single.facts.exif.focalLength && `${single.facts.exif.focalLength}mm`].filter(Boolean).join(' · '),
            Artist: single.facts.exif.artist,
          }).filter(([, v]) => v).map(([k, v]) => (
            <React.Fragment key={k}><dt className="text-base-content/50 uppercase">{k}</dt><dd className="truncate" title={String(v)}>{v}</dd></React.Fragment>
          ))}
        </dl>
      )}

      <div className="p-3 flex flex-col gap-3 border-b border-base-content/10">
        <div className="flex items-center justify-between">
          <Stars value={rating} onSet={r => updateMeta(ids, { rating: r || undefined })} />
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour label">
            {COLOR_LABELS.map(l => (
              <button key={l} type="button" role="radio" aria-checked={label === l} aria-label={`Label ${l}`} title={l}
                className={`w-4 h-4 rounded-full border-2 ${label === l ? 'border-base-content' : 'border-transparent'}`}
                style={{ background: LABEL_COLORS[l] }} onClick={() => updateMeta(ids, { label: label === l ? undefined : l })} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-mono uppercase text-base-content/50">Tags</span>
          <div className="flex flex-wrap gap-1">
            {tags.map(({ t, partial }) => (
              <span key={t} className={`flex items-center gap-1 px-1.5 h-6 text-2xs font-mono border ${partial ? 'border-dashed border-base-content/30 text-base-content/60' : 'border-base-content/20'}`}
                title={partial ? 'On some of the selected assets' : undefined}>
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} className="hover:text-error" onClick={() => updateMeta(ids, m => ({ ...m, tags: m.tags?.filter(x => x !== t) }))}>×</button>
              </span>
            ))}
          </div>
          <input list="asset-tag-vocabulary" value={tagInput} placeholder="Add tags, Enter" aria-label="Add tags"
            className="form-input h-7 text-xs" onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTags(tagInput); }} />
          <datalist id="asset-tag-vocabulary">{vocabulary.map(t => <option key={t} value={t} />)}</datalist>
        </div>

        {single && (
          <>
            <label className="flex flex-col gap-1 text-2xs font-mono uppercase text-base-content/50">
              Caption
              <textarea value={caption} rows={3} aria-label="Caption" className="form-input text-xs normal-case"
                onChange={e => setCaption(e.target.value)} onBlur={() => updateMeta(ids, { caption: caption.trim() || undefined })} />
            </label>
            <label className="flex flex-col gap-1 text-2xs font-mono uppercase text-base-content/50">
              Copyright
              <input value={copyright} aria-label="Copyright" className="form-input h-7 text-xs normal-case"
                onChange={e => setCopyright(e.target.value)} onBlur={() => updateMeta(ids, { copyright: copyright.trim() || undefined })} />
            </label>
          </>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 border-b border-base-content/10">
        <span className="text-2xs font-mono uppercase text-base-content/50">Collections</span>
        <div className="flex flex-wrap gap-1">
          {inCollections.map(c => (
            <span key={c.id} className="flex items-center gap-1 px-1.5 h-6 text-2xs font-mono border border-base-content/20">
              {c.name}
              <button type="button" aria-label={`Remove from ${c.name}`} className="hover:text-error" onClick={() => removeFromCollection(c.id, ids)}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input list="asset-collections" value={collectionName} placeholder="Collection name" aria-label="Collection name"
            className="form-input h-7 text-xs flex-1 min-w-0" onChange={e => setCollectionName(e.target.value)} />
          <datalist id="asset-collections">{library.collections.map(c => <option key={c.id} value={c.name} />)}</datalist>
          <button type="button" className={btn} disabled={!collectionName.trim()} onClick={() => {
            const name = collectionName.trim();
            const existing = library.collections.find(c => c.name.toLowerCase() === name.toLowerCase());
            if (existing) addToCollection(existing.id, ids); else createCollection(name, ids);
            setCollectionName('');
          }}>Add</button>
        </div>
        <div className="flex gap-1">
          {stack
            ? <button type="button" className={btn} onClick={() => unstack(stack.id)}>Unstack</button>
            : <button type="button" className={btn} disabled={entries.length < 2} title="Group into one card; the first selected stays on top" onClick={() => createStack(ids)}>Stack</button>}
        </div>
      </div>

      <div className="p-3 flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={busy || !canRename} title={canRename ? undefined : 'Rename works inside one folder view'} onClick={onRename}>Rename…</button>
        <button type="button" className={btn} disabled={busy} onClick={onCopyMove}>Copy / Move…</button>
        <button type="button" className={btn} disabled={busy || !writable}
          title={writable ? 'Write rating, label, tags, caption and copyright into the file (XMP)' : 'Only JPEG and PNG can carry written metadata — these stay index-only'}
          onClick={onWriteMetadata}>Write to file</button>
        {!writable && entries.length > 0 && <span className="text-2xs font-mono uppercase text-warning self-center">Index-only</span>}
      </div>
    </aside>
  );
};

export default AssetInspector;
