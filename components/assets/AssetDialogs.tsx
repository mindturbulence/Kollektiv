import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { planIsValid, planRename, type RenamePlanItem } from '../../services/assets/batchRename';
import { scanDirectoryTree } from '../../services/assets/directoryScanner';
import type { AssetEntry } from '../../services/assets/assetFilter';
import type { ConflictPolicy } from '../../services/assets/fileOps';
import type { AssetRootState, DirectoryNode } from '../../services/assets/types';
import { loadCategories } from '../../utils/galleryStorage';
import type { GalleryCategory } from '../../types';

const btn = 'h-8 px-3 text-2xs font-mono uppercase border border-base-content/15 text-base-content/70 hover:text-primary hover:border-primary disabled:opacity-40 disabled:pointer-events-none';
const primary = 'h-8 px-3 text-2xs font-mono uppercase border border-primary text-primary hover:bg-primary/10 disabled:opacity-40 disabled:pointer-events-none';

/** Batch rename (plan Task 13): the preview table is exactly what Apply does. */
export const BatchRenameModal: React.FC<{
  isOpen: boolean;
  entries: AssetEntry[];
  otherNames: string[];
  busy: boolean;
  onClose: () => void;
  onApply: (plan: RenamePlanItem[]) => void;
}> = ({ isOpen, entries, otherNames, busy, onClose, onApply }) => {
  const [pattern, setPattern] = useState('{name}');
  const [start, setStart] = useState(1);
  const plan = useMemo(() => planRename(entries, pattern, start, otherNames), [entries, pattern, start, otherNames]);
  const changed = plan.filter(p => p.newName !== p.entry.file.name).length;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Rename ${entries.length} file${entries.length === 1 ? '' : 's'}`} size="xl">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-2xs font-mono uppercase text-base-content/60">
          Pattern
          <input value={pattern} aria-label="Rename pattern" className="form-input h-8 text-xs normal-case" onChange={e => setPattern(e.target.value)} />
        </label>
        <p className="text-2xs font-mono text-base-content/60">
          Tokens: {'{name} {index} {date} {width} {height} {rating} {label} {ext}'} — the extension is kept unless you use {'{ext}'}.
        </p>
        <label className="flex items-center gap-2 text-2xs font-mono uppercase text-base-content/60">
          Start index
          <input type="number" min={0} value={start} aria-label="Start index" className="form-input h-8 w-20 text-xs" onChange={e => setStart(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <div className="max-h-72 overflow-y-auto border border-base-content/10">
          <table className="w-full text-2xs font-mono" aria-label="Rename preview">
            <thead><tr className="text-left text-base-content/50 uppercase"><th className="p-1.5">Now</th><th className="p-1.5">Becomes</th></tr></thead>
            <tbody>
              {plan.map(p => (
                <tr key={p.entry.file.id} className="border-t border-base-content/5">
                  <td className="p-1.5 truncate max-w-[220px]">{p.entry.file.name}</td>
                  <td className={`p-1.5 truncate max-w-[260px] ${p.error ? 'text-error' : p.newName !== p.entry.file.name ? 'text-primary' : 'text-base-content/50'}`}>
                    {p.newName}{p.error && ` — ${p.error}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={busy || !planIsValid(plan) || changed === 0} onClick={() => onApply(plan)}>
            Rename {changed}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const FolderPicker: React.FC<{ node: DirectoryNode; value: string; onPick: (n: DirectoryNode) => void; depth?: number }> = ({ node, value, onPick, depth = 0 }) => (
  <div>
    <button type="button" onClick={() => onPick(node)} aria-pressed={value === node.path}
      className={`w-full text-left px-2 py-1 text-xs font-mono truncate ${value === node.path ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/60'}`}
      style={{ paddingLeft: 8 + depth * 14 }}>
      {depth === 0 ? node.name : `/${node.name}`}
    </button>
    {node.children.map(c => <FolderPicker key={c.id} node={c} value={value} onPick={onPick} depth={depth + 1} />)}
  </div>
);

/** Copy / move to any folder of any connected root, with an explicit conflict policy (plan Task 14). */
export const CopyMoveModal: React.FC<{
  isOpen: boolean;
  count: number;
  roots: AssetRootState[];
  initialRootId: string | null;
  busy: boolean;
  onClose: () => void;
  onApply: (dest: { root: AssetRootState; node: DirectoryNode }, mode: 'copy' | 'move', policy: ConflictPolicy) => void;
}> = ({ isOpen, count, roots, initialRootId, busy, onClose, onApply }) => {
  const granted = roots.filter(r => r.status === 'granted');
  const [rootId, setRootId] = useState(initialRootId ?? granted[0]?.id ?? '');
  const [tree, setTree] = useState<DirectoryNode | null>(null);
  const [node, setNode] = useState<DirectoryNode | null>(null);
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [policy, setPolicy] = useState<ConflictPolicy>('keep-both');
  const root = granted.find(r => r.id === rootId);
  useEffect(() => {
    if (!isOpen || !root) return;
    let cancelled = false;
    setTree(null); setNode(null);
    void scanDirectoryTree(root.id, root.handle).then(t => { if (!cancelled) { setTree(t); setNode(t); } });
    return () => { cancelled = true; };
  }, [isOpen, root]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Copy or move ${count} file${count === 1 ? '' : 's'}`} size="lg">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Operation">
          {(['copy', 'move'] as const).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? primary : btn} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-2xs font-mono uppercase text-base-content/60">
          Root
          <select aria-label="Destination root" className="form-select h-8 text-xs flex-1" value={rootId} onChange={e => setRootId(e.target.value)}>
            {granted.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="max-h-60 overflow-y-auto border border-base-content/10" aria-label="Destination folder">
          {tree ? <FolderPicker node={tree} value={node?.path ?? ''} onPick={setNode} /> : <p className="p-2 text-2xs font-mono text-base-content/60">Reading folders…</p>}
        </div>
        <label className="flex items-center gap-2 text-2xs font-mono uppercase text-base-content/60">
          If a file with the same name exists
          <select aria-label="Conflict policy" className="form-select h-8 text-xs" value={policy} onChange={e => setPolicy(e.target.value as ConflictPolicy)}>
            <option value="keep-both">Keep both (add a number)</option>
            <option value="skip">Skip that file</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={busy || !root || !node} onClick={() => root && node && onApply({ root, node }, mode, policy)}>
            {mode === 'copy' ? 'Copy' : 'Move'} here
          </button>
        </div>
      </div>
    </Modal>
  );
};

/** Duplicate review (plan Task 20): groups of near-identical images; the user
 *  selects the extras and decides what to do with them. Nothing is deleted here. */
export const DuplicatesModal: React.FC<{
  isOpen: boolean;
  groups: AssetEntry[][];
  thumbUrl: (id: string) => string | undefined;
  onClose: () => void;
  onSelectExtras: (ids: string[]) => void;
}> = ({ isOpen, groups, thumbUrl, onClose, onSelectExtras }) => {
  const extras = groups.flatMap(g => g.slice(1).map(e => e.file.id));
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={groups.length ? `${groups.length} group${groups.length === 1 ? '' : 's'} of look-alike images` : 'No duplicates found'} size="xl">
      <div className="flex flex-col gap-3">
        {groups.length === 0 && <p className="text-xs font-mono text-base-content/60">No near-identical images among the assets shown.</p>}
        <div className="max-h-96 overflow-y-auto flex flex-col gap-3">
          {groups.map((g, gi) => (
            <div key={gi} className="flex gap-2 overflow-x-auto pb-1" aria-label={`Duplicate group ${gi + 1}`}>
              {g.map((e, i) => (
                <figure key={e.file.id} className={`flex-shrink-0 w-28 border ${i === 0 ? 'border-primary' : 'border-base-content/15'}`}>
                  {thumbUrl(e.file.id) ? <img src={thumbUrl(e.file.id)} alt={e.file.name} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-base-300" />}
                  <figcaption className="p-1 text-2xs font-mono truncate" title={e.file.path}>{i === 0 ? '★ ' : ''}{e.file.name}</figcaption>
                  <p className="px-1 pb-1 text-2xs font-mono text-base-content/50">{e.facts?.width}×{e.facts?.height}</p>
                </figure>
              ))}
            </div>
          ))}
        </div>
        <p className="text-2xs font-mono text-base-content/60">★ = kept (largest image in the group). Selecting the others lets you move, export or tag them.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Close</button>
          <button type="button" className={primary} disabled={!extras.length} onClick={() => onSelectExtras(extras)}>Select {extras.length} extras</button>
        </div>
      </div>
    </Modal>
  );
};

/** Save to the Vault gallery, into a chosen category (plan Task 24). */
export const VaultSaveModal: React.FC<{
  isOpen: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onSave: (categoryId: string | undefined) => void;
}> = ({ isOpen, count, busy, onClose, onSave }) => {
  const [categories, setCategories] = useState<GalleryCategory[] | null>(null);
  const [categoryId, setCategoryId] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    loadCategories().then(c => { if (!cancelled) setCategories(c); }, () => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [isOpen]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Save ${count} to the Vault gallery`} size="sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-2xs font-mono uppercase text-base-content/60">
          Category
          <select aria-label="Gallery category" className="form-select h-8 text-xs" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <p className="text-2xs font-mono text-base-content/60">Tags and caption from the index come along. RAW files are skipped (develop them in the Image Editor first).</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={busy} onClick={() => onSave(categoryId || undefined)}>Save</button>
        </div>
      </div>
    </Modal>
  );
};
