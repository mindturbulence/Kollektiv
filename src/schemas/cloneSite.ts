import type { CaptureErrorCode } from './captureSite';

// POST /api/clone-site (CL-1, plan docs/plans/2026-10-07-website-clone.md). Same request body and error codes as
// /api/capture-site. Everything below came out of an untrusted page and has been through sanitizeMeasurements:
// strings that are not a colour, length, font family, path or known name were dropped. Visible text is the one
// free-text field (`text`, `heading`, labels, alt) and must stay fenced as data wherever it is used.

/** `[value, count]`, most frequent first. */
export type Tally = [string, number];

export interface TypeSample {
  /** h1…h4, body, link, button, nav, small, label. */
  role: string;
  family: string[];
  weight: number;
  sizePx: number;
  lineHeight: string;
  letterSpacing: string;
  transform: string;
  color: string;
}

export interface FontInfo {
  family: string;
  weight: string;
  style: string;
}

export interface SectionInfo {
  index: number;
  tag: string;
  /** banner, navigation, main, contentinfo, region or ''. */
  role: string;
  y: number;
  height: number;
  background: string;
  heading: string;
  counts: { headings: number; paragraphs: number; buttons: number; links: number; images: number; inputs: number };
  columns: number;
}

export interface LinkInfo {
  path: string;
  label: string;
}

export type AssetKind = 'photo' | 'logo' | 'icon' | 'illustration' | 'background' | 'video' | 'canvas';

/** A visual asset's place and shape. Never its URL: the clone recreates assets instead of copying them. */
export interface AssetInfo {
  kind: AssetKind;
  section: number;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  objectFit?: string;
  alt?: string;
  autoplay?: boolean;
  loop?: boolean;
}

export interface TextBlock {
  section: number;
  tag: string;
  text: string;
}

export interface HoverRule {
  selector: string;
  props: Record<string, string>;
}

export interface FixedInfo {
  position: 'fixed' | 'sticky';
  y: number;
  height: number;
  background: string;
  /** True when the capture hid it (a cookie/consent overlay or a large fixed layer covering the page). */
  hiddenForCapture: boolean;
}

export interface PageMeasurements {
  viewport: { width: number; height: number };
  scrollHeight: number;
  lang: string;
  colors: { text: Tally[]; background: Tally[]; border: Tally[] };
  rootVars: [string, string][];
  type: TypeSample[];
  fontsLoaded: FontInfo[];
  fontFaces: FontInfo[];
  radii: Tally[];
  spacing: Tally[];
  maxWidths: Tally[];
  shadows: Tally[];
  sections: SectionInfo[];
  nav: LinkInfo[];
  footer: LinkInfo[];
  assets: AssetInfo[];
  text: TextBlock[];
  motion: { transitions: Tally[]; animations: Tally[]; keyframes: string[] };
  hover: HoverRule[];
  fixed: FixedInfo[];
  /** Detected platforms/libraries, from a fixed list (e.g. "Next.js", "Framer", "GSAP", "Tailwind CSS"). */
  tech: string[];
}

export interface CloneShot {
  width: number;
  height: number;
  mime: 'image/jpeg';
  imageBase64: string;
}

export type CloneSiteResponse =
  | {
      ok: true;
      finalUrl: string;
      title: string;
      desktop: CloneShot;
      /** null when the mobile pass failed; the desktop result is still usable. */
      mobile: CloneShot | null;
      measurements: { desktop: PageMeasurements; mobile: PageMeasurements | null };
    }
  | { ok: false; code: CaptureErrorCode; error: string };
