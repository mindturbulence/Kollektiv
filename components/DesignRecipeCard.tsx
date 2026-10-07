import React from 'react';
import type { DesignRecipe } from '../types';
import { DeleteIcon, CopyIcon } from './icons';
import RecipeThumb from './RecipeThumb';
import { FontChips, PaletteStrip, TagPills, shortDate } from './RecipeTokens';

interface DesignRecipeCardProps {
  recipe: DesignRecipe;
  onOpen: (recipe: DesignRecipe) => void;
  onUse: (recipe: DesignRecipe) => void;
  onCopyPrompt: (recipe: DesignRecipe) => void;
  onDelete: (recipe: DesignRecipe) => void;
  deleteDisabled?: boolean;
}

// Revealed on hover and keyboard focus; opacity only, so nothing shifts and nothing sits at a magic offset.
const REVEAL = 'pointer-events-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-fast';

const DesignRecipeCard: React.FC<DesignRecipeCardProps> = ({ recipe, onOpen, onUse, onCopyPrompt, onDelete, deleteDisabled }) => {
  const palette = recipe.palette ?? [];
  const fonts = recipe.fonts ?? [];
  const date = shortDate(recipe.createdAt);
  const meta = [date, recipe.refs.length > 1 ? `${recipe.refs.length} refs` : ''].filter(Boolean).join(' · ');

  return (
    <li className="paper-card relative group p-2.5 flex flex-col gap-3">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-base-200">
        <RecipeThumb path={recipe.refs[0]} title={recipe.title} />
        {(palette.length > 0 || fonts.length > 0) && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 pointer-events-none">
            <PaletteStrip palette={palette} />
            <FontChips fonts={fonts} />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 z-raised flex items-center justify-end gap-1.5 p-2.5 pointer-events-none">
          <button
            type="button"
            aria-label={`Use recipe ${recipe.title}`}
            onClick={(e) => { e.stopPropagation(); onUse(recipe); }}
            className={`paper-btn paper-btn-primary paper-btn-sm ${REVEAL}`}
          >
            Use recipe
          </button>
          <button
            type="button"
            aria-label={`Copy prompt for ${recipe.title}`}
            title="Copy prompt"
            onClick={(e) => { e.stopPropagation(); onCopyPrompt(recipe); }}
            className={`paper-btn paper-btn-sm paper-btn-icon ${REVEAL}`}
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${recipe.title}`}
            disabled={deleteDisabled}
            onClick={(e) => { e.stopPropagation(); onDelete(recipe); }}
            className={`paper-btn paper-btn-sm paper-btn-icon paper-btn-danger ${REVEAL}`}
          >
            <DeleteIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 px-1.5 pb-1.5">
        <div className="flex items-center gap-2">
          <h3 className="paper-title min-w-0 flex-1 truncate text-base font-medium leading-tight">
            {/* Stretched button: its ::after covers the whole card, so the card opens on click and Enter without nesting buttons. */}
            <button
              type="button"
              onClick={() => onOpen(recipe)}
              className="block w-full truncate text-left after:absolute after:inset-0 after:z-base after:content-['']"
            >
              {recipe.title}
            </button>
          </h3>
          <span className="paper-tag capitalize shrink-0">{recipe.pageType}</span>
        </div>
        {meta && <p className="text-xs text-base-content/60">{meta}</p>}
        <TagPills tags={recipe.tags} />
      </div>
    </li>
  );
};

export default DesignRecipeCard;
