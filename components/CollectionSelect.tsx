import React, { useMemo } from 'react';
import type { DesignCollection } from '../types';
import { buildTree, flattenTree } from '../utils/designCollections';

interface Props {
  collections: DesignCollection[];
  /** Collection id, '' = Unsorted. An id that no longer exists renders as Unsorted. */
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Collection picker for recipe forms: "Unsorted" first, then the tree indented by depth. */
const CollectionSelect: React.FC<Props> = ({ collections, value, onChange, disabled, className = '' }) => {
  const options = useMemo(() => flattenTree(buildTree(collections)), [collections]);
  const current = options.some((o) => o.collection.id === value) ? value : '';
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="paper-label">Collection</span>
      <select value={current} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="paper-input w-full">
        <option value="">Unsorted</option>
        {options.map(({ collection, depth }) => (
          <option key={collection.id} value={collection.id}>{`${'   '.repeat(depth)}${collection.name}`}</option>
        ))}
      </select>
    </label>
  );
};

export default CollectionSelect;
