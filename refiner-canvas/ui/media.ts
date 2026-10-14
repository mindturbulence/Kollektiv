// Session-only object URLs for generated clips so the Result node can preview them. After a reload the clip is
// still in the Gallery (its id is the node output's assetKey); only the inline preview is gone.

const previews = new Map<string, string>();

export const setPreview = (assetKey: string, url: string): void => { previews.set(assetKey, url); };

export const getPreview = (assetKey: string): string | undefined => previews.get(assetKey);
