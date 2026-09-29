/**
 * One-off image re-encode through the Converter's ImageMagick worker (for
 * gallery save-time conversion to WebP/AVIF, which canvas can't always encode).
 * The worker is created on first use and kept for the session.
 */
import { ConvertWorkerManager } from '../services/convert/convertManager';

let manager: ConvertWorkerManager | null = null;
let seq = 0;

export async function transcodeImage(blob: Blob, targetId: 'webp' | 'avif', quality: number): Promise<Blob> {
  manager ??= new ConvertWorkerManager(() => new Worker(new URL('../workers/convertWorker.ts', import.meta.url), { type: 'module' }));
  const res = await manager.convert({ id: `gallery_${Date.now()}_${++seq}`, data: await blob.arrayBuffer(), fileName: `image.${blob.type.split('/')[1] || 'png'}`, targetId, quality });
  return new Blob([res.data], { type: res.mime });
}
