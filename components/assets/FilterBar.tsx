import React, { useState } from 'react';
import { COLOR_LABELS, deleteFilter, saveFilter, type ColorLabel, type FilterCriteria, type SavedFilter } from '../../services/assets/assetLibrary';
import { isEmptyCriteria, type SortKey } from '../../services/assets/assetFilter';

/** Tailwind-free swatches so the six Bridge colours read the same in every theme. */
export const LABEL_COLORS: Record<ColorLabel, string> = { red: '#e5484d', yellow: '#f5d90a', green: '#46a758', blue: '#3e63dd', purple: '#8e4ec6' };

const chip = 'h-7 px-2 text-2xs font-mono uppercase border transition-colors';
const idle = 'border-base-content/15 text-base-content/70 hover:text-primary';
const on = 'border-primary text-primary bg-primary/10';

/** Filter + sort bar (plan Task 7): search, min rating, colour labels, tag,
 *  file type, sort; saved filters apply in one click. Criteria compose (AND). */
const FilterBar: React.FC<{
  criteria: FilterCriteria;
  onChange: (c: FilterCriteria) => void;
  sort: SortKey;
  descending: boolean;
  onSort: (key: SortKey, descending: boolean) => void;
  exts: string[];
  saved: SavedFilter[];
  shown: number;
  total: number;
}> = ({ criteria, onChange, sort, descending, onSort, exts, saved, shown, total }) => {
  const [naming, setNaming] = useState<string | null>(null);
  const set = (patch: Partial<FilterCriteria>) => onChange({ ...criteria, ...patch });
  const toggleLabel = (l: ColorLabel) => {
    const cur = criteria.labels ?? [];
    set({ labels: cur.includes(l) ? cur.filter(x => x !== l) : [...cur, l] });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-base-content/10" role="search" aria-label="Filter assets">
      <input
        type="search" value={criteria.text ?? ''} placeholder="Search name, tags, caption…" aria-label="Search assets"
        className="form-input h-7 text-xs w-48" onChange={e => set({ text: e.target.value })}
      />
      <select aria-label="Minimum rating" className="form-select h-7 text-2xs w-32" value={criteria.minRating ?? 0}
        onChange={e => set({ minRating: Number(e.target.value) || undefined })}>
        <option value={0}>Any rating</option>
        {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{'★'.repeat(r)}+</option>)}
      </select>
      <div className="flex items-center gap-1" role="group" aria-label="Colour labels">
        {COLOR_LABELS.map(l => (
          <button key={l} type="button" aria-pressed={criteria.labels?.includes(l) ?? false} aria-label={`Label ${l}`} title={l}
            className={`w-5 h-5 rounded-full border-2 ${criteria.labels?.includes(l) ? 'border-base-content' : 'border-transparent opacity-60 hover:opacity-100'}`}
            style={{ background: LABEL_COLORS[l] }} onClick={() => toggleLabel(l)} />
        ))}
      </div>
      <input
        type="text" value={criteria.tags?.join(', ') ?? ''} placeholder="Tags" aria-label="Filter by tags (comma separated)"
        className="form-input h-7 text-xs w-28"
        onChange={e => set({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
      />
      {exts.length > 1 && (
        <select aria-label="File type" className="form-select h-7 text-2xs w-28" value={criteria.exts?.[0] ?? ''}
          onChange={e => set({ exts: e.target.value ? [e.target.value] : undefined })}>
          <option value="">All types</option>
          {exts.map(x => <option key={x} value={x}>.{x}</option>)}
        </select>
      )}
      <select aria-label="Sort by" className="form-select h-7 text-2xs w-36" value={sort} onChange={e => onSort(e.target.value as SortKey, descending)}>
        <option value="name">Name</option>
        <option value="date">Date modified</option>
        <option value="size">File size</option>
        <option value="dimensions">Dimensions</option>
        <option value="rating">Rating</option>
      </select>
      <button type="button" className={`${chip} ${idle}`} aria-label={descending ? 'Sort descending' : 'Sort ascending'} onClick={() => onSort(sort, !descending)}>
        {descending ? '↓' : '↑'}
      </button>
      {!isEmptyCriteria(criteria) && (
        <>
          <button type="button" className={`${chip} ${idle}`} onClick={() => onChange({})}>Clear</button>
          {naming === null ? (
            <button type="button" className={`${chip} ${idle}`} onClick={() => setNaming('')}>Save filter</button>
          ) : (
            <input autoFocus aria-label="Filter name" placeholder="Name, Enter to save" value={naming} className="form-input h-7 text-xs w-36"
              onChange={e => setNaming(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setNaming(null);
                if (e.key === 'Enter' && naming.trim()) { saveFilter(naming.trim(), criteria); setNaming(null); }
              }}
              onBlur={() => setNaming(null)} />
          )}
        </>
      )}
      {saved.map(f => (
        <span key={f.id} className={`${chip} ${idle} flex items-center gap-1`}>
          <button type="button" className="uppercase" onClick={() => onChange(f.criteria)} title="Apply saved filter">{f.name}</button>
          <button type="button" aria-label={`Delete filter ${f.name}`} className="hover:text-error" onClick={() => deleteFilter(f.id)}>×</button>
        </span>
      ))}
      <span className="ml-auto text-2xs font-mono text-base-content/60 uppercase">{shown === total ? `${total}` : `${shown} of ${total}`}</span>
    </div>
  );
};

export default FilterBar;
export { on as chipOn, idle as chipIdle, chip as chipBase };
