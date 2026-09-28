// ─── Kollektiv Image Editor — PSD import ────────────────────────────────────
// Opens a Photoshop file as a layered document via ag-psd (MIT), which is
// lazy-loaded so it only ships when a PSD is opened. Raster layers keep their
// position, visibility, opacity and blend mode; text/shape/adjustment layers
// come in as their rasterized pixels (ag-psd renders them). Top-level groups
// stay groups; deeper nesting is flattened into the parent group (the editor
// groups one level deep). A PSD with no layer data opens as its composite.

import type { Layer as PsdLayer, Psd } from 'ag-psd';
import type { BlendMode, EditorDocument, GroupLayer, ImageLayer, Layer } from '../types';
import { bitmapToLayer, exceedsMaxDim, MAX_DIM } from './FileIO';

const EDITOR_BLEND_MODES = new Set<string>([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  'dissolve', 'linear-burn', 'linear-dodge', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'darker-color', 'lighter-color',
]);

/** ag-psd blend names ('color dodge') → editor ids ('color-dodge'); modes the
 *  editor lacks (subtract, divide, pass through…) fall back to normal. */
export function psdBlendMode(mode: string | undefined): BlendMode {
  const id = (mode ?? 'normal').replace(/ /g, '-');
  return (EDITOR_BLEND_MODES.has(id) ? id : 'normal') as BlendMode;
}

export function isPsdFile(file: File): boolean {
  return /\.psd$/i.test(file.name) || file.type === 'image/vnd.adobe.photoshop';
}

async function toImageLayer(src: PsdLayer): Promise<ImageLayer | null> {
  const canvas = src.canvas;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null; // empty/adjustment layer
  const layer = bitmapToLayer(await createImageBitmap(canvas), src.name || 'Layer');
  layer.transform.origin = { x: src.left ?? 0, y: src.top ?? 0 };
  layer.visible = !src.hidden;
  layer.opacity = Math.round((src.opacity ?? 1) * 100);
  layer.blendMode = psdBlendMode(src.blendMode);
  return layer;
}

/** Converts ag-psd children (bottom → top) to editor layers (index 0 = top). */
async function convert(children: PsdLayer[] | undefined, depth: number): Promise<Layer[]> {
  const out: Layer[] = [];
  for (const child of [...(children ?? [])].reverse()) {
    if (child.children) {
      const inner = await convert(child.children, depth + 1);
      if (depth > 0) { out.push(...inner); continue; } // flatten nested groups
      if (inner.length === 0) continue;
      const group: GroupLayer = {
        id: crypto.randomUUID(),
        name: child.name || 'Group',
        type: 'group',
        children: inner,
        transform: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 }, rotation: 0, flipH: false, flipV: false },
        opacity: Math.round((child.opacity ?? 1) * 100),
        blendMode: psdBlendMode(child.blendMode),
        visible: !child.hidden,
      };
      out.push(group);
    } else {
      const layer = await toImageLayer(child);
      if (layer) out.push(layer);
    }
  }
  return out;
}

export async function importPsd(file: File): Promise<EditorDocument> {
  const { readPsd } = await import('ag-psd');
  let psd: Psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
  } catch (err) {
    throw new Error(`Could not read PSD: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (exceedsMaxDim(psd.width, psd.height)) {
    throw new Error(`PSD is ${psd.width}×${psd.height}px — the editor supports up to ${MAX_DIM}px per side.`);
  }

  let layers = await convert(psd.children, 0);
  if (layers.length === 0) {
    if (!psd.canvas) throw new Error('The PSD has no readable layers or composite image.');
    layers = [bitmapToLayer(await createImageBitmap(psd.canvas), 'Background')];
  }

  const firstImage = (list: Layer[]): Layer | undefined =>
    list.find(l => l.type === 'image') ?? list.flatMap(l => l.type === 'group' ? l.children : []).find(l => l.type === 'image');
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^.]+$/, '') || 'Untitled',
    width: psd.width,
    height: psd.height,
    resolution: 72,
    layers,
    guides: [],
    activeLayerId: (firstImage(layers) ?? layers[0]).id,
    createdAt: now,
    updatedAt: now,
  };
}
