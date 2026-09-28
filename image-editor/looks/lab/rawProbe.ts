// ─── Looks Lab — Phase 0 RAW decode probe ───────────────────────────────────
// Decodes a user-picked RAW with libraw-wasm-nothread (LibRaw 0.22.1, LGPL-2.1/
// CDDL, unmodified; no COOP/COEP needed) at 16-bit linear-ish output and
// reports time, size and JS heap growth, plus the embedded-preview fallback.

import type { ProbeRow } from './gpuProbe';

const heapMB = () => {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : null;
};

export async function rawDecode(file: File): Promise<ProbeRow[]> {
  const rows: ProbeRow[] = [{ name: 'File', value: `${file.name} — ${(file.size / 1048576).toFixed(1)} MB` }];
  const { default: LibRaw } = await import('libraw-wasm-nothread');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = new LibRaw();
  const heap0 = heapMB();
  try {
    let t = performance.now();
    // Linear 16-bit, camera WB, sRGB primaries, no auto-brighten — the plan's Develop input.
    await raw.open(bytes, { outputBps: 16, outputColor: 1, useCameraWb: true, noAutoBright: true, userQual: 3 });
    rows.push({ name: 'open()', value: `${(performance.now() - t).toFixed(0)} ms` });

    const meta = (await raw.metadata()) as unknown as Record<string, unknown> | undefined;
    if (meta) rows.push({ name: 'Camera', value: `${meta.camera_make ?? meta.make ?? ''} ${meta.camera_model ?? meta.model ?? ''}`.trim() || '—' });

    t = performance.now();
    const img = await raw.imageData();
    const ms = performance.now() - t;
    if (!img) throw new Error('decoder returned no image');
    const mp = (img.width * img.height) / 1e6;
    rows.push({ name: 'Decode (demosaic → 16-bit RGB)', value: `${ms.toFixed(0)} ms — ${img.width}×${img.height} (${mp.toFixed(1)} MP, ${img.bits}-bit)`, ok: ms < 10_000 });
    rows.push({ name: 'Decoded buffer', value: `${(img.data.byteLength / 1048576).toFixed(0)} MB` });
    const heap1 = heapMB();
    if (heap0 !== null && heap1 !== null) rows.push({ name: 'JS heap growth', value: `${(heap1 - heap0).toFixed(0)} MB (worker WASM heap not included)` });

    t = performance.now();
    const thumb = await raw.thumbnailData();
    rows.push(thumb
      ? { name: 'Embedded preview (fallback)', value: `${thumb.width}×${thumb.height} ${thumb.format} in ${(performance.now() - t).toFixed(0)} ms` }
      : { name: 'Embedded preview (fallback)', value: 'none', ok: false });
  } catch (e) {
    rows.push({ name: 'Decode', value: `failed: ${(e as Error).message} — would fall back to the embedded preview`, ok: false });
  } finally {
    raw.dispose();
  }
  return rows;
}
