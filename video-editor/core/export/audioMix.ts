// Audio mixdown for export. Reuses core/playback's volume rules (base +
// keyframes + fades — see evaluateVolume) so export and preview agree.
import type { Clip, MediaEngine, Project } from '../types';
import { evaluateVolume } from '../playback/keyframes';

export interface ExportRange {
  start: number;
  end: number;
}

export interface AudioSegment {
  clip: Clip;
  mediaId: string;
  /** Timeline seconds, absolute (not relative to range). */
  overlapStart: number;
  overlapEnd: number;
}

/** Clips that can produce audio: audio/video track, not muted, has a mediaId, media.hasAudio. */
export function collectAudibleSegments(project: Project, range: ExportRange): AudioSegment[] {
  const tracks = new Map(project.tracks.map(t => [t.id, t]));
  const media = new Map(project.media.map(m => [m.id, m]));
  const segments: AudioSegment[] = [];
  for (const clip of project.clips) {
    const track = tracks.get(clip.trackId);
    if (!track || track.kind === 'text' || track.muted) continue;
    if (!clip.mediaId) continue;
    const item = media.get(clip.mediaId);
    if (!item || !item.hasAudio) continue;
    const clipEnd = clip.start + clip.duration;
    const overlapStart = Math.max(clip.start, range.start);
    const overlapEnd = Math.min(clipEnd, range.end);
    if (overlapEnd <= overlapStart) continue;
    segments.push({ clip, mediaId: clip.mediaId, overlapStart, overlapEnd });
  }
  return segments;
}

/**
 * Samples evaluateVolume across the segment's overlap window for
 * setValueCurveAtTime — same sampling shape as playback/controller's
 * buildVolumeCurve, so a keyframed volume ramp sounds the same on export.
 */
export function buildGainCurve(seg: AudioSegment): Float32Array {
  const { clip, overlapStart, overlapEnd } = seg;
  const span = overlapEnd - overlapStart;
  const points = Math.max(2, Math.min(200, Math.round(span * 20) + 1));
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = overlapStart + (span * i) / (points - 1);
    curve[i] = evaluateVolume(clip, t - clip.start);
  }
  return curve;
}

/** Source-time offset/duration into the clip's media, respecting speed. */
export function sourceWindow(seg: AudioSegment): { offset: number; duration: number } {
  const { clip, overlapStart, overlapEnd } = seg;
  return {
    offset: clip.inPoint + (overlapStart - clip.start) * clip.speed,
    duration: (overlapEnd - overlapStart) * clip.speed,
  };
}

/** Mixes every audible segment down to a single AudioBuffer for the export range. Null when nothing is audible. */
export async function mixAudio(project: Project, media: MediaEngine, range: ExportRange): Promise<AudioBuffer | null> {
  const segments = collectAudibleSegments(project, range);
  if (segments.length === 0) return null;
  const sampleRate = 48000;
  const length = Math.max(1, Math.round((range.end - range.start) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  for (const seg of segments) {
    const item = project.media.find(m => m.id === seg.mediaId);
    if (!item) continue;
    const buffer = await media.getAudioBuffer(seg.mediaId, item.file, ctx);
    if (!buffer) continue;
    const { offset, duration } = sourceWindow(seg);
    if (duration <= 0) continue;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = seg.clip.speed;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueCurveAtTime(buildGainCurve(seg), seg.overlapStart - range.start, seg.overlapEnd - seg.overlapStart);
    source.start(seg.overlapStart - range.start, Math.max(0, offset), duration);
  }
  return ctx.startRendering();
}
