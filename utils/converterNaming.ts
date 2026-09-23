import { CONVERTER_NAME_MAX_LEN } from '../constants/converterFormats';

/**
 * Output naming for the Converter (plan W1 + failure table):
 * - sanitize: strip path separators and control chars, cap at 200 chars
 * - collisions: deterministic `-2`, `-3` suffixes within a batch
 */

/** Strip path separators, control chars and trailing dots; cap length. */
export function sanitizeBaseName(name: string, maxLen: number = CONVERTER_NAME_MAX_LEN): string {
  let base = name
    // strip any directory components (win + unix separators)
    .replace(/^.*[\\/]/, '')
    // remove control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // filesystem-hostile characters
    .replace(/[<>:"|?*]/g, '')
    .trim();
  if (!base) base = 'converted';
  // leave room for a suffix like "-12" before the extension
  if (base.length > maxLen) {
    base = base.slice(0, maxLen - 4).trimEnd();
  }
  return base;
}

/** Build `base.ext`, then `base-2.ext`, `base-3.ext`, … for names already taken in this batch. */
export function buildOutputName(sanitizedBase: string, ext: string, taken: Set<string>): string {
  const normalizedExt = ext.toLowerCase();
  let candidate = `${sanitizedBase}.${normalizedExt}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${sanitizedBase}-${n}.${normalizedExt}`;
    n++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}
