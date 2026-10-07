import type { LLMSettings } from '../types';
import { cropTopToJpeg, downscaleToJpeg, readPixels } from '../utils/designImage';
import { extractDesignPalette } from '../utils/paletteExtract';
import { parseDesignSpec, sanitizeTokenValues, type DesignSpec } from '../utils/designSpec';
import { buildDesignSpecPrompt } from './designSpecPrompt';
import { generateDesignSpec, type DesignSpecImage } from './llmService';

export const MAX_EXTRACT_REFS = 4;
export const MAX_EXTRACT_BYTES = 8 * 1024 * 1024;
/** Assumed width of the browser the screenshots were taken in. */
export const VIEWPORT_WIDTH = 1440;
const CROP_HEIGHT = 1600;
const DOWNSCALE_EDGE = 1600;

export interface ExtractResult {
  spec: DesignSpec;
  missing: string[];
  truncated: boolean;
  /** Front matter paths that had an "(est.)" marker removed. */
  stripped: string[];
}

/** "data:image/jpeg;base64,AAA" -> { mimeType: 'image/jpeg', data: 'AAA' }. */
export const toDesignSpecImage = (dataUrl: string): DesignSpecImage => {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Could not encode a reference image.');
  return { mimeType: m[1], data: m[2] };
};

/** Model output -> validated spec with guess markers stripped from token values. */
export function postProcessDesignSpec(raw: string): ExtractResult {
  let parsed: ReturnType<typeof parseDesignSpec>;
  try {
    parsed = parseDesignSpec(raw);
  } catch (e) {
    throw new Error(`The model's answer is not a usable DESIGN.md. ${e instanceof Error ? e.message : String(e)}`);
  }
  const { frontMatter, stripped } = sanitizeTokenValues(parsed.spec.frontMatter);
  return { spec: { ...parsed.spec, frontMatter }, missing: parsed.missing, truncated: parsed.truncated, stripped };
}

/**
 * Screenshots -> DESIGN.md draft. Caps are checked before any network call. The first image is
 * the top of ref 1 at viewport scale (type sizes are measured there); the rest are downscaled.
 */
export async function extractDesignSpec(
  refBlobs: Blob[],
  settings: LLMSettings,
  onProgress?: (step: string) => void,
): Promise<ExtractResult> {
  if (refBlobs.length === 0) throw new Error('Add at least one reference screenshot before extracting.');
  if (refBlobs.length > MAX_EXTRACT_REFS) {
    throw new Error(`Extraction takes at most ${MAX_EXTRACT_REFS} reference images (got ${refBlobs.length}).`);
  }

  onProgress?.('Preparing screenshots…');
  const [first, ...rest] = refBlobs;
  const top = await cropTopToJpeg(first, VIEWPORT_WIDTH, CROP_HEIGHT);
  const dataUrls = [top.dataUrl];
  const legend = ['top of the page at full resolution: measure type, spacing and radii here'];
  if (!top.whole) {
    dataUrls.push(await downscaleToJpeg(first, DOWNSCALE_EDGE));
    legend.push('the same page in full, downscaled: use it for Page Composition');
  }
  for (const blob of rest) {
    dataUrls.push(await downscaleToJpeg(blob, DOWNSCALE_EDGE));
    legend.push('another screen of the same site, downscaled');
  }
  const images = dataUrls.map(toDesignSpecImage);
  const bytes = images.reduce((n, i) => n + i.data.length, 0);
  if (bytes > MAX_EXTRACT_BYTES) {
    throw new Error(`The screenshots are ${(bytes / 1024 / 1024).toFixed(1)} MB encoded; extraction sends at most ${MAX_EXTRACT_BYTES / 1024 / 1024} MB. Use fewer or smaller references.`);
  }

  const palette = extractDesignPalette(await readPixels(first, 200));
  // The crop is never upscaled and retina captures are brought down to <=1440, so its pixels are CSS px:
  // a 390px screenshot is a 390px viewport (scale 1), not a 1440px one shrunk.
  const prompt = buildDesignSpecPrompt({ palette, imgWidth: top.width, viewportWidth: top.width, images: legend });

  onProgress?.('Waiting for the model…');
  const raw = await generateDesignSpec(images, prompt, settings);
  return postProcessDesignSpec(raw);
}
