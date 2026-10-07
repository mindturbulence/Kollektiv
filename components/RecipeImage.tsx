import React, { useState } from 'react';
import { useRecipeImageUrl } from '../hooks/useRecipeImageUrl';

/** A reference screenshot at full width and natural height, top-aligned and never cropped; the caller scrolls it. */
const RecipeImage: React.FC<{ path: string | undefined; title: string }> = ({ path, title }) => {
  const { url, failed } = useRecipeImageUrl(path);
  // A blob that loads but does not decode (corrupt file) fires onError on the <img>.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (failed || (url && brokenUrl === url)) {
    return <div className="flex h-48 w-full items-center justify-center text-xs text-base-content/60">No preview</div>;
  }
  if (url) return <img src={url} alt={title} onError={() => setBrokenUrl(url)} className="block w-full h-auto" />;
  return <div className="h-48 w-full animate-pulse bg-base-200" />;
};

export default RecipeImage;
