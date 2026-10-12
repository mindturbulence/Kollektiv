/**
 * "Clone a website" client pipeline (CL-2): capture + measure on the server, then let the active vision provider
 * write the DESIGN.md, then assemble everything createRecipe needs. Two steps so a failed AI call can be retried
 * without capturing again (captures are slow and rate limited).
 */
import type { LLMSettings, RecipePageType } from '../types';
import type { CloneSiteResponse } from '../src/schemas/cloneSite';
import type { CaptureErrorCode } from '../src/schemas/captureSite';
import { cropTopToJpeg, downscaleToJpeg } from '../utils/designImage';
import { parseDesignSpec, serializeDesignSpec, type DesignSpec } from '../utils/designSpec';
import {
  cleanTitle,
  cloneFiles,
  measuredOnlySpec,
  measurementDigest,
  takeRecipeMeta,
  untrustedPageText,
  withCodeSections,
  type CloneCapture,
} from '../utils/cloneDigest';
import type { CloneFile } from '../utils/designLibraryStorage';
import { buildCloneSpecPrompt } from './cloneSitePrompt';
import { postProcessDesignSpec, toDesignSpecImage } from './designSpecService';
import { generateDesignSpec } from './llmService';
import { ProviderUnsupportedError } from './providerFallback';
import { sanitizeMeasurements } from './siteMeasure';

/** Above the server's own 60 s budget, so the server's timeout answer arrives first. */
const CLIENT_TIMEOUT_MS = 75_000;

export interface CapturedSite extends CloneCapture {
  desktopShot: Blob;
  mobileShot: Blob | null;
  capturedAt: number;
}

export class CloneCaptureError extends Error {
  constructor(readonly code: CaptureErrorCode | 'network', message: string) {
    super(message);
    this.name = 'CloneCaptureError';
  }
}

const CODE_TEXT: Partial<Record<CaptureErrorCode, string>> = {
  invalid_url: 'Enter a full http:// or https:// address.',
  blocked_host: 'That address is local or private, so it cannot be cloned.',
  rate_limited: 'Too many captures in the last minute; wait a moment and try again.',
  busy: 'Another capture is running; try again when it finishes.',
  timeout: 'The site took too long to load (60 s).',
  unreachable: 'The site could not be loaded.',
  too_large: 'The page is too large to capture.',
  capture_unavailable: 'The server cannot start a browser (install Edge or Chrome, or run "npx playwright install chromium").',
  forbidden_origin: 'The request was refused by the server.',
  capture_failed: 'The capture failed.',
};

const toBlob = async (mime: string, base64: string): Promise<Blob> => (await fetch(`data:${mime};base64,${base64}`)).blob();

/** POST /api/clone-site. Throws CloneCaptureError with a user-facing message. */
export async function captureSite(url: string, signal?: AbortSignal): Promise<CapturedSite> {
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  let data: CloneSiteResponse;
  try {
    const res = await fetch('/api/clone-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    data = (await res.json()) as CloneSiteResponse;
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new CloneCaptureError('network', 'Could not reach the Kollektiv server (cloning needs it running).');
  }
  if (!data.ok) {
    // Responses from outer middleware (e.g. the global origin guard) carry no `code`.
    const code = (data as { code?: CaptureErrorCode }).code;
    const detail = code && (code === 'capture_unavailable' || code === 'blocked_host') && data.error ? data.error : undefined;
    throw new CloneCaptureError(code ?? 'capture_failed', detail ?? (code && CODE_TEXT[code]) ?? 'The capture failed.');
  }
  return {
    finalUrl: data.finalUrl,
    title: data.title,
    desktop: data.measurements.desktop,
    mobile: data.measurements.mobile,
    desktopShot: await toBlob(data.desktop.mime, data.desktop.imageBase64),
    mobileShot: data.mobile ? await toBlob(data.mobile.mime, data.mobile.imageBase64) : null,
    capturedAt: Date.now(),
  };
}

/** True when the error means "this provider cannot read images at all" (fall back to measurements), not a transient failure. */
export function isNoVisionError(e: unknown): boolean {
  if (e instanceof ProviderUnsupportedError) return true;
  const msg = e instanceof Error ? e.message : '';
  return /cannot read images|Pick a vision model|vision-capable/i.test(msg);
}

export interface ClonedRecipe {
  title: string;
  pageType: RecipePageType;
  tags: string[];
  sourceUrl: string;
  refs: { name: string; blob: Blob }[];
  spec: DesignSpec;
  /** The model's answer was cut off (no Signature). */
  truncated: boolean;
  /** As parseDesignSpec reports them (missing headings / front matter keys). */
  missing: string[];
  /** Front matter paths that had an "(est.)" marker removed. */
  stripped: string[];
  /** Built from measurements only. */
  measuredOnly: boolean;
  clone: { capturedAt: number; tech: string[]; files: Record<CloneFile, string> };
}

const recipeShell = (site: CapturedSite) => ({
  title: cleanTitle(site.title, site.finalUrl),
  sourceUrl: site.finalUrl,
  refs: [{ name: 'desktop.jpg', blob: site.desktopShot }, ...(site.mobileShot ? [{ name: 'mobile.jpg', blob: site.mobileShot }] : [])],
  clone: { capturedAt: site.capturedAt, tech: site.desktop.tech, files: cloneFiles(site) },
});

/** A recipe without any model call (no vision provider). */
export function measuredRecipe(site: CapturedSite): ClonedRecipe {
  const spec = measuredOnlySpec(site);
  return { ...recipeShell(site), pageType: 'other', tags: [], spec, truncated: false, missing: parseDesignSpec(serializeDesignSpec(spec)).missing, stripped: [], measuredOnly: true };
}

/**
 * The active vision provider writes the spec from screenshots + measurements. Throws on any model failure; the caller
 * decides between retrying and measuredRecipe (isNoVisionError tells which).
 */
export async function writeCloneSpec(site: CapturedSite, settings: LLMSettings, onProgress?: (step: string) => void): Promise<ClonedRecipe> {
  onProgress?.('Preparing screenshots…');
  const top = await cropTopToJpeg(site.desktopShot, 1440, 1600);
  const dataUrls = [top.dataUrl];
  const legend = ['desktop 1440 px, top of the page at full resolution'];
  if (!top.whole) {
    dataUrls.push(await downscaleToJpeg(site.desktopShot, 1600));
    legend.push('the whole desktop page, downscaled: use it for Page Composition');
  }
  if (site.mobileShot) {
    // A 390×4500 capture downscaled to a 1600 px edge would be ~140 px wide; send its top at full resolution instead.
    dataUrls.push((await cropTopToJpeg(site.mobileShot, 390, 1600)).dataUrl);
    legend.push('mobile 390 px, top of the page at full resolution');
  }
  const prompt = buildCloneSpecPrompt({ images: legend, digest: measurementDigest(site), pageText: untrustedPageText(site) });

  onProgress?.('Writing the design spec…');
  const raw = await generateDesignSpec(dataUrls.map(toDesignSpecImage), prompt, settings);
  const result = postProcessDesignSpec(raw);
  const meta = takeRecipeMeta(result.spec.frontMatter);
  const spec = withCodeSections({ ...result.spec, frontMatter: meta.frontMatter }, site);
  const missing = parseDesignSpec(serializeDesignSpec(spec)).missing;
  return { ...recipeShell(site), pageType: meta.pageType, tags: meta.tags, spec, truncated: result.truncated, missing, stripped: result.stripped, measuredOnly: false };
}

/**
 * Rebuilds the capture of a saved cloned recipe (measurements.json + its two refs) so the spec can be rewritten without
 * capturing again. The file is re-sanitized: it sits in the vault and may have been edited.
 */
export function siteFromRecipe(input: { title: string; sourceUrl?: string; capturedAt: number; measurementsJson: string; shots: Blob[] }): CapturedSite {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.measurementsJson);
  } catch {
    throw new Error('measurements.json is not valid JSON; clone the site again.');
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as { desktop?: unknown; mobile?: unknown };
  const [desktopShot, mobileShot] = input.shots;
  if (!desktopShot) throw new Error('The desktop screenshot of this clone is missing.');
  return {
    finalUrl: input.sourceUrl ?? '',
    title: input.title,
    desktop: sanitizeMeasurements(obj.desktop),
    mobile: obj.mobile && mobileShot ? sanitizeMeasurements(obj.mobile) : null,
    desktopShot,
    mobileShot: obj.mobile && mobileShot ? mobileShot : null,
    capturedAt: input.capturedAt,
  };
}
