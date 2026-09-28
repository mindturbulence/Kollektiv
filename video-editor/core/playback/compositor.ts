// OWNED BY: playback agent.
import type { Clip, ComposedFrame, Compositor, MediaEngine, Project, RenderLayer, Track } from '../types';
import { evaluateTransform } from './keyframes';

function projectEnd(project: Project): number {
  let end = 0;
  for (const clip of project.clips) end = Math.max(end, clip.start + clip.duration);
  return end;
}

/** Runtime tag: RenderLayer.source is either an ImageBitmap or a text descriptor. */
function hasClose(source: RenderLayer['source']): source is ImageBitmap {
  return typeof source === 'object' && source !== null && 'close' in source
    && typeof (source as { close?: unknown }).close === 'function';
}

function closeIfBitmap(source: RenderLayer['source'] | undefined): void {
  if (source && hasClose(source)) source.close();
}

function findClipAt(project: Project, track: Track, time: number): Clip | undefined {
  return project.clips.find(c => c.trackId === track.id && time >= c.start && time < c.start + c.duration);
}

function sourceTimeFor(clip: Clip, time: number): number {
  return clip.inPoint + (time - clip.start) * clip.speed;
}

async function buildLayer(media: MediaEngine, project: Project, clip: Clip, time: number): Promise<RenderLayer | null> {
  const transform = evaluateTransform(clip, time - clip.start);
  if (clip.text) {
    return { source: { text: clip.text.content, style: clip.text.style }, transform, effects: clip.effects };
  }
  if (!clip.mediaId) return null;
  const mediaItem = project.media.find(m => m.id === clip.mediaId);
  if (!mediaItem) return null;
  const bitmap = await media.getVideoFrame(mediaItem.id, mediaItem.file, sourceTimeFor(clip, time));
  if (!bitmap) return null;
  return { source: bitmap, transform, effects: clip.effects };
}

export function createCompositor(media: MediaEngine): Compositor {
  return {
    async compose(project: Project, time: number): Promise<ComposedFrame> {
      const layers: RenderLayer[] = [];
      const transitions: ComposedFrame['transitions'] = [];

      for (const track of project.tracks) {
        if (track.hidden || track.kind === 'audio') continue;

        const consumed = new Set<string>();

        for (const tr of project.transitions) {
          if (tr.duration <= 0) continue;
          const from = project.clips.find(c => c.id === tr.fromClipId);
          const to = project.clips.find(c => c.id === tr.toClipId);
          if (!from || !to || from.trackId !== track.id || to.trackId !== track.id) continue;

          const cut = to.start;
          const windowStart = cut - tr.duration / 2;
          const windowEnd = cut + tr.duration / 2;
          if (time < windowStart || time > windowEnd) continue;

          consumed.add(from.id);
          consumed.add(to.id);
          const [fromLayer, toLayer] = await Promise.all([
            buildLayer(media, project, from, time),
            buildLayer(media, project, to, time),
          ]);
          if (fromLayer && toLayer) {
            transitions.push({ type: tr.type, progress: (time - windowStart) / tr.duration, from: fromLayer, to: toLayer });
          } else {
            closeIfBitmap(fromLayer?.source);
            closeIfBitmap(toLayer?.source);
          }
        }

        const clip = findClipAt(project, track, time);
        if (clip && !consumed.has(clip.id)) {
          const layer = await buildLayer(media, project, clip, time);
          if (layer) layers.push(layer);
        }
      }

      return { background: project.settings.background, layers, transitions };
    },
  };
}

export { projectEnd, closeIfBitmap };
