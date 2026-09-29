/**
 * One-shot file handoffs into tools that mount fresh on navigation (Resizer,
 * Media Analyzer): the sender parks files here and navigates; the tool takes
 * them on mount. Same idea as the video editor's pending payload.
 */
export type HandoffTarget = 'resizer' | 'media_analyzer';

const pending = new Map<HandoffTarget, File[]>();

export function setPendingFiles(target: HandoffTarget, files: File[]): void {
  pending.set(target, files);
}

export function takePendingFiles(target: HandoffTarget): File[] {
  const files = pending.get(target) ?? [];
  pending.delete(target);
  return files;
}
