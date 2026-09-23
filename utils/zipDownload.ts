import JSZip from 'jszip';

/**
 * Shared ZIP-download helper (plan W6).
 *
 * Extracted from the third duplicated JSZip blob-assembly + anchor-click
 * pattern (ImageResizer.tsx, VideoToFrames.tsx, fileUtils.createZipAndDownload).
 * Reused by ImageResizer, VideoToFrames and ConverterPage.
 */

export interface ZipEntry {
  /** Name inside the archive. Collisions overwrite — dedupe with makeUniqueName() if needed. */
  name: string;
  content: Blob | ArrayBuffer | Uint8Array | string;
}

/**
 * Assemble entries into a zip Blob.
 * Throws if entries is empty (callers should no-op instead of shipping an empty zip).
 */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error('buildZip: no entries');
  }
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.content);
  }
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Build a zip from entries and trigger a browser download.
 * Returns the object URL so callers can revoke it later (or pass `revokeAfterMs`).
 */
export async function downloadZip(
  entries: ZipEntry[],
  zipFileName: string,
  opts?: { revokeAfterMs?: number },
): Promise<string> {
  const blob = await buildZip(entries);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (opts?.revokeAfterMs !== undefined) {
    setTimeout(() => URL.revokeObjectURL(url), opts.revokeAfterMs);
  }
  return url;
}

/** Generate `base.ext`, `base-2.ext`, `base-3.ext`, … avoiding names already seen. */
export function makeUniqueName(base: string, ext: string, taken: Set<string>): string {
  let candidate = `${base}.${ext}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${n}.${ext}`;
    n++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}
