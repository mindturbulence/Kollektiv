import React, { useEffect, useRef, useState } from 'react';
import type { DesignRecipe } from '../types';
import { ChevronDownIcon } from './icons';
import RecipeImage from './RecipeImage';
import RecipeThumb from './RecipeThumb';
import { FontChips, PaletteStrip, shortDate } from './RecipeTokens';

interface DesignRecipePreviewProps {
  recipe: DesignRecipe;
  onUse: (recipe: DesignRecipe) => void;
  onCopyPrompt: (recipe: DesignRecipe) => void;
  onEdit: (recipe: DesignRecipe) => void;
  onDelete: (recipe: DesignRecipe) => void;
  deleteDisabled?: boolean;
}

/** sourceUrl is user-entered: only http(s) becomes a link or an address-bar host, anything else stays text. */
const parseWebUrl = (raw: string | undefined): URL | null => {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
};

/** Detail pane of the Library view: summary, split action button and the framed reference screenshot. */
const DesignRecipePreview: React.FC<DesignRecipePreviewProps> = ({ recipe, onUse, onCopyPrompt, onEdit, onDelete, deleteDisabled }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  // The picked reference belongs to one recipe; another recipe starts at its first reference without an effect.
  const [pick, setPick] = useState({ id: recipe.id, index: 0 });
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const refIndex = pick.id === recipe.id ? Math.min(pick.index, Math.max(recipe.refs.length - 1, 0)) : 0;
  const web = parseWebUrl(recipe.sourceUrl);
  const date = shortDate(recipe.createdAt);
  const items = () => Array.from(menuWrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  useEffect(() => {
    if (!menuOpen) return;
    items()[0]?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const closeMenu = () => { setMenuOpen(false); toggleRef.current?.focus(); };
  const choose = (action: (r: DesignRecipe) => void) => { closeMenu(); action(recipe); };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Tab') { setMenuOpen(false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    list[(at + step + list.length) % list.length].focus();
  };

  return (
    <article className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="paper-title min-w-0 break-words text-2xl leading-tight">{recipe.title}</h2>
            <span className="paper-tag capitalize shrink-0">{recipe.pageType}</span>
          </div>
          <p className="text-xs text-base-content/60">
            {date}
            {web && <>{date && ' · '}<a href={web.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-base-content">Source</a></>}
            {!web && recipe.sourceUrl && <>{date && ' · '}<span className="break-all">{recipe.sourceUrl}</span></>}
          </p>
          {recipe.overview && <p className="line-clamp-3 break-words text-sm text-base-content/70">{recipe.overview}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <PaletteStrip palette={recipe.palette} />
            <FontChips fonts={recipe.fonts} />
          </div>
        </div>

        <div ref={menuWrapRef} className="relative flex shrink-0" onKeyDown={onMenuKeyDown}>
          <button type="button" onClick={() => onUse(recipe)} className="paper-btn paper-btn-primary paper-btn-split-start">
            Use recipe
          </button>
          <button
            ref={toggleRef}
            type="button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="paper-btn paper-btn-primary paper-btn-split-end"
          >
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" aria-label="Recipe actions" className="absolute right-0 top-full z-dropdown mt-1.5 flex w-48 flex-col gap-0.5 rounded-xl border border-base-content/10 bg-base-100 p-1 shadow-lg">
              <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onCopyPrompt)} className="paper-btn paper-btn-ghost paper-btn-sm w-full justify-start">Copy prompt only</button>
              <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onEdit)} className="paper-btn paper-btn-ghost paper-btn-sm w-full justify-start">Edit recipe</button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={deleteDisabled}
                title={deleteDisabled ? 'The library is read-only' : undefined}
                onClick={() => choose(onDelete)}
                className="paper-btn paper-btn-ghost paper-btn-sm paper-btn-danger w-full justify-start"
              >
                Delete recipe
              </button>
            </div>
          )}
        </div>
      </header>

      {recipe.refs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="References">
          {recipe.refs.map((path, i) => (
            <button
              key={path}
              type="button"
              aria-label={`Reference ${i + 1}`}
              aria-pressed={i === refIndex}
              onClick={() => setPick({ id: recipe.id, index: i })}
              className={`h-10 w-14 overflow-hidden rounded-lg border bg-base-200 transition-opacity duration-quick ${i === refIndex ? 'border-base-content opacity-100' : 'border-base-content/10 opacity-60 hover:opacity-100'}`}
            >
              <RecipeThumb path={path} title="" />
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
        <div className="flex items-center gap-3 border-b border-base-content/10 bg-base-200 px-3 py-2">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-base-content/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-base-content/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-base-content/20" />
          </span>
          <span data-testid="frame-address" className="min-w-0 flex-1 truncate rounded-md bg-base-100 px-3 py-1 text-center text-xs text-base-content/60">
            {web ? web.hostname : recipe.title}
          </span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {/* key: remount per reference so the previous blob is never shown (and revoked) under the new path. */}
          <RecipeImage key={recipe.refs[refIndex] ?? 'none'} path={recipe.refs[refIndex]} title={recipe.title} />
        </div>
      </div>
    </article>
  );
};

export default DesignRecipePreview;
