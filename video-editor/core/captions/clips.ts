// ─── Kollektiv Video Editor — captions <-> text clips ────────────────────────
// Bridges SRT Cues and the project's text-track Clips. Building follows the
// same immutable/no-side-effect contract as ui/placement.ts: pure functions
// that return data for the caller to dispatch through applyEdit.

import { DEFAULT_TRANSFORM } from '../types';
import type { Clip, EditAction, Project, TextStyle, Track } from '../types';
import type { Cue } from './srt';

// Matches ui/placement.ts's createTextClip default TextStyle.
const DEFAULT_CAPTION_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 96,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
};

export interface CaptionsToEditOptions {
  trackId?: string;
  style?: TextStyle;
}

function bottomThirdY(project: Project): number {
  return project.settings.height / 3;
}

function findCaptionsTrack(project: Project, trackId?: string): Track | undefined {
  if (trackId) return project.tracks.find(t => t.id === trackId && t.kind === 'text' && !t.locked);
  // "Empty-enough": an unlocked text track carrying no clips at all — reusing
  // a track that already has content would just overlap-skip everything.
  return project.tracks.find(t => t.kind === 'text' && !t.locked && !project.clips.some(c => c.trackId === t.id));
}

function overlapsAny(clips: Clip[], trackId: string, start: number, duration: number): boolean {
  return clips.some(c => c.trackId === trackId && start < c.start + c.duration && c.start < start + duration);
}

/** Builds one 'batch' EditAction that imports `cues` as text clips. Adds a
 * 'Captions' text track first when no unlocked empty text track is
 * available. Cues that would overlap an already-placed clip are skipped
 * (never shifted — shifting captions off their spoken time is worse than
 * dropping them). Returns null for an empty cue list. */
export function captionsToEdit(project: Project, cues: Cue[], opts: CaptionsToEditOptions = {}): EditAction | null {
  if (cues.length === 0) return null;

  const style = opts.style ?? DEFAULT_CAPTION_STYLE;
  const y = bottomThirdY(project);
  const existingTrack = findCaptionsTrack(project, opts.trackId);

  const actions: EditAction[] = [];
  let trackId: string;
  if (existingTrack) {
    trackId = existingTrack.id;
  } else {
    trackId = crypto.randomUUID();
    const track: Track = { id: trackId, kind: 'text', name: 'Captions', muted: false, hidden: false, locked: false };
    actions.push({ type: 'addTrack', track });
  }

  const placed: Clip[] = project.clips.filter(c => c.trackId === trackId);
  for (const cue of cues) {
    const duration = cue.end - cue.start;
    if (duration <= 0) continue;
    if (overlapsAny(placed, trackId, cue.start, duration)) continue;
    const clip: Clip = {
      id: crypto.randomUUID(),
      trackId,
      start: cue.start,
      duration,
      inPoint: 0,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: { ...DEFAULT_TRANSFORM, y },
      keyframes: [],
      effects: [],
      text: { content: cue.text, style },
    };
    placed.push(clip);
    actions.push({ type: 'addClip', clip });
  }

  if (actions.length === 0 || (actions.length === 1 && actions[0].type === 'addTrack')) return null;
  return { type: 'batch', actions, label: 'Import captions' };
}

/** Text clips on `trackId` (or the 'Captions' track, falling back to the
 * first text track carrying at least one text clip), time-ordered, as Cues. */
export function clipsToCues(project: Project, trackId?: string): Cue[] {
  const hasText = (t: Track) => project.clips.some(c => c.trackId === t.id && c.text);
  const track = trackId
    ? project.tracks.find(t => t.id === trackId)
    : project.tracks.find(t => t.kind === 'text' && t.name === 'Captions') ??
      project.tracks.find(t => t.kind === 'text' && hasText(t));
  if (!track) return [];
  return project.clips
    .filter(c => c.trackId === track.id && c.text)
    .sort((a, b) => a.start - b.start)
    .map(c => ({ start: c.start, end: c.start + c.duration, text: c.text!.content }));
}
