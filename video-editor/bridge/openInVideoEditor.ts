// ─── Kollektiv Video Editor — Asset Bridge ─────────────────────────────────
// The ONLY module in video-editor/ permitted to import utils/eventBus.
// Mirrors image-editor's 'openInEditor' bus event (hooks/useAppEventBus.ts),
// but App.tsx's 'video_editor' payload wiring is owned by this agent (see
// docs/plans/2026-09-26-video-editor-plan.md §7 ownership split), so the
// payload itself travels through this module's own subscriber list instead
// of a new utils/eventBus.ts event key — App.tsx subscribes directly.

import { appEventBus } from '../../utils/eventBus';
import type { VideoEditorOpenPayload } from '../core/types';

let pending: VideoEditorOpenPayload | undefined;
const listeners = new Set<(payload: VideoEditorOpenPayload) => void>();

/** Opens the Video Editor tab with the given files (from Assets Manager, Gallery, etc). */
export function openInVideoEditor(files: Array<{ blob: Blob; name: string }>): void {
  const payload: VideoEditorOpenPayload = { kind: 'files', files };
  pending = payload;
  listeners.forEach((fn) => fn(payload));
  appEventBus.emit('navigate', 'video_editor');
}

/** App.tsx calls this once to receive open payloads as they arrive. */
export function subscribeVideoEditorOpen(fn: (payload: VideoEditorOpenPayload) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The payload from the most recent openInVideoEditor call, if App.tsx mounted late. */
export function takePendingVideoEditorPayload(): VideoEditorOpenPayload | undefined {
  const p = pending;
  pending = undefined;
  return p;
}
