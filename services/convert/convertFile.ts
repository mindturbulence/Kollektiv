/**
 * One-shot conversion of a vault file for the `convert_file` assistant tool:
 * the Converter's own rules (convertRegistry) pick the engine and reject what
 * the page would reject; ImageMagick runs in its worker, ffmpeg through the
 * shared audioVideoConverter. Returns the bytes and the vault path to save to.
 */
import { evaluateConversion } from './convertRegistry';
import { ConvertWorkerManager } from './convertManager';
import { audioVideoConverter } from './audioVideoConverter';
import { getFormatById } from '../../constants/converterFormats';
import { sanitizeBaseName } from '../../utils/converterNaming';

let magick: ConvertWorkerManager | null = null;
let seq = 0;

export async function convertVaultFile(
  blob: Blob, sourcePath: string, targetId: string, opts: { quality?: number; maxEdge?: number } = {},
): Promise<{ blob: Blob; path: string }> {
  const name = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const target = getFormatById(targetId);
  if (!target) throw new Error(`unknown target "${targetId}"`);
  const verdict = evaluateConversion({ name, ext, size: blob.size }, targetId);
  if (!verdict.ok) throw new Error(`can't convert .${ext} to ${target.label} (${verdict.rejectReason})`);
  const req = {
    id: `tool_${Date.now()}_${++seq}`, data: await blob.arrayBuffer(), fileName: name, targetId,
    quality: Math.max(1, Math.min(100, Math.round(opts.quality ?? 80))), maxEdge: opts.maxEdge,
  };
  const res = verdict.engine === 'ffmpeg'
    ? await audioVideoConverter.convert(req)
    : await (magick ??= new ConvertWorkerManager(() => new Worker(new URL('../../workers/convertWorker.ts', import.meta.url), { type: 'module' }))).convert(req);
  const base = sanitizeBaseName(dot > 0 ? name.slice(0, dot) : name);
  return { blob: new Blob([res.data], { type: res.mime }), path: `gallery/converted/${base}.${target.ext}` };
}
