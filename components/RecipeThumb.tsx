import React from 'react';
import { useRecipeImageUrl } from '../hooks/useRecipeImageUrl';

/** A reference screenshot cropped to its frame. Loaded per instance; fine for a personal library. */
const RecipeThumb: React.FC<{ path: string | undefined; title: string }> = ({ path, title }) => {
  const { url, failed } = useRecipeImageUrl(path);

  if (url) return <img src={url} alt={title} className="w-full h-full object-cover object-top" />;
  if (failed) return <div className="w-full h-full flex items-center justify-center text-xs text-base-content/60">No preview</div>;
  return <div className="w-full h-full animate-pulse bg-base-200" />;
};

export default RecipeThumb;
