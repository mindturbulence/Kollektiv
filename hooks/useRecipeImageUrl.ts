import { useEffect, useState } from 'react';
import { fileSystemManager } from '../utils/fileUtils';

/** A vault reference image as an object URL, revoked when the path changes or the component unmounts. `failed` = no path, missing file or read error. */
export function useRecipeImageUrl(path: string | undefined): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    if (!path) { setFailed(true); return; }
    let active = true;
    let created: string | null = null;
    setFailed(false);
    fileSystemManager.getFileAsBlob(path).then((blob) => {
      if (!active) return;
      if (!blob) { setFailed(true); return; }
      created = URL.createObjectURL(blob);
      setUrl(created);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);

  return { url, failed };
}
