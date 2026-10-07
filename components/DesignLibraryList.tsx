import React, { useEffect, useId, useRef } from 'react';
import type { DesignRecipe } from '../types';
import RecipeThumb from './RecipeThumb';
import { TagPills } from './RecipeTokens';

interface DesignLibraryListProps {
  recipes: DesignRecipe[];
  /** Id of the highlighted recipe; the caller guarantees it is one of `recipes` (or undefined for an empty list). */
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/** Master rail of the Library view: one listbox, focus stays on it and the highlighted row is announced via aria-activedescendant. */
const DesignLibraryList: React.FC<DesignLibraryListProps> = ({ recipes, selectedId, onSelect }) => {
  const prefix = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const optionId = (id: string) => `${prefix}-${id}`;

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView.
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (recipes.length === 0) return;
    const current = Math.max(0, recipes.findIndex((r) => r.id === selectedId));
    let next: number;
    if (e.key === 'ArrowDown') next = Math.min(current + 1, recipes.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(current - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = recipes.length - 1;
    else return;
    e.preventDefault();
    if (next !== current) onSelect(recipes[next].id);
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Recipes"
      tabIndex={0}
      aria-activedescendant={selectedId ? optionId(selectedId) : undefined}
      onKeyDown={onKeyDown}
      className="h-full overflow-y-auto rounded-xl p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/30"
    >
      {recipes.map((r) => {
        const selected = r.id === selectedId;
        return (
          <div
            key={r.id}
            id={optionId(r.id)}
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(r.id)}
            className={`flex cursor-pointer items-center gap-3 rounded-xl p-1.5 transition-colors duration-quick ${selected ? 'bg-base-200' : 'hover:bg-base-200/60'}`}
          >
            <div className="h-12 w-[4.25rem] shrink-0 overflow-hidden rounded-lg bg-base-200">
              <RecipeThumb path={r.refs[0]} title={r.title} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <TagPills tags={r.tags} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DesignLibraryList;
