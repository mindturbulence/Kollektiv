import { lookupModelProfile, type ModelProfile } from '../constants/modelProfiles';
import type { PromptModifiers } from '../types';

export interface Beat { start: number; end: number }

const DEFAULT_DURATION = 6;

/** Beats a clip of `duration` seconds can hold: about one per 3 s, 1..5. */
export const maxBeats = (duration: number): number => Math.min(5, Math.max(1, Math.ceil(duration / 3)));

/** Contiguous, whole-second beat ranges covering 0..duration. Invalid input falls back to 6 s. */
export const buildTimelineSkeleton = (duration: number): Beat[] => {
  const total = Number.isFinite(duration) && duration >= 1 ? Math.round(duration) : DEFAULT_DURATION;
  const n = Math.min(maxBeats(total), total);
  const beats: Beat[] = [];
  for (let i = 0; i < n; i++) {
    beats.push({ start: Math.round((i * total) / n), end: Math.round(((i + 1) * total) / n) });
  }
  return beats;
};

export const beatLabel = (b: Beat): string => `${b.start}–${b.end}s`;

const RANGE_AT_LINE_START = /^\s*(\d+)\s*[–-]\s*(\d+)\s*s\b/;

/** Checks that timestamped lines start at 0, touch end-to-start, and finish at `duration`. */
export const validateTimeline = (text: string, duration: number): { ok: boolean; reason?: string } => {
  const ranges = text.split('\n').map(l => RANGE_AT_LINE_START.exec(l)).filter((m): m is RegExpExecArray => !!m)
    .map(m => ({ start: Number(m[1]), end: Number(m[2]) }));
  if (!ranges.length) return { ok: false, reason: 'no timestamped beats' };
  let cursor = 0;
  for (const r of ranges) {
    if (r.start !== cursor) return { ok: false, reason: `${r.start < cursor ? 'overlap' : 'gap'} at ${r.start}s` };
    if (r.end <= r.start) return { ok: false, reason: `empty range ${r.start}–${r.end}s` };
    cursor = r.end;
  }
  return cursor === duration ? { ok: true } : { ok: false, reason: `ends at ${cursor}s, expected ${duration}s` };
};

/** The model's allowed duration nearest to `raw`; with nothing set, its middle value (6 s if unknown). */
export const resolveVideoDuration = (profile: ModelProfile, raw?: string): number => {
  const asked = Number.parseFloat(raw ?? '');
  const list = profile.videoDurations;
  const range = profile.videoDurationRange;
  if (list?.length) {
    if (!Number.isFinite(asked)) return list[Math.floor((list.length - 1) / 2)];
    return list.reduce((best, d) => (Math.abs(d - asked) < Math.abs(best - asked) ? d : best));
  }
  const want = Number.isFinite(asked) ? asked : DEFAULT_DURATION;
  const clamped = range ? Math.min(range[1], Math.max(range[0], want)) : want;
  return Math.max(1, Math.round(clamped));
};

const SHARED_LOCK = (isI2V: boolean) => isI2V
  ? `SUBJECT LOCK (image-to-video): open with one sentence beginning "Keep the exact subject, outfit and setting of the reference image". Add an attribute only if the user's concept states it — never invent faces, clothing or colours you cannot see. Then direct movement only.`
  : `WORLD: open with one compact paragraph fixing the subject (appearance, wardrobe), the setting and the light, so the clip stays consistent.`;

/** Native audio for this exact model: the profile's flag unless the model is listed as silent. */
const modelHasAudio = (profile: ModelProfile, model: string): boolean | undefined => {
  const lower = model.toLowerCase();
  return profile.videoSilentModels?.some(s => lower.includes(s)) ? false : profile.videoAudio;
};

export interface VideoCaps {
  timeline: NonNullable<ModelProfile['videoTimeline']>;
  /** Discrete lengths, else null (use min/max). */
  durations: number[] | null;
  min: number;
  max: number;
  /** true native audio, false silent, undefined unknown. */
  audio: boolean | undefined;
}

/** What the UI may offer for a target video model. Unlisted models: 3–15 s, timestamps, audio unknown. */
export const videoCaps = (model: string): VideoCaps => {
  const p = lookupModelProfile(model, true);
  const list = p.videoDurations?.length ? p.videoDurations : null;
  const [min, max] = list ? [Math.min(...list), Math.max(...list)] : (p.videoDurationRange ?? [3, 15]);
  return { timeline: p.videoTimeline ?? 'timestamps', durations: list, min, max, audio: modelHasAudio(p, model) };
};

/** Short spoken lines that plausibly fit a clip: about one per 3 s. */
export const dialogueLineBudget = (duration: number): number => Math.max(1, Math.round(duration / 3));

const audioRules = (timeline: VideoCaps['timeline'], m: PromptModifiers, audioSupported: boolean | undefined, duration: number): string => {
  const mode = m.videoAudio ?? 'auto';
  if (mode === 'off' || audioSupported === false) {
    return `AUDIO: none. Do not write dialogue, sound effects or music — this clip is silent.`;
  }
  const where = timeline === 'timestamps'
    ? `Attach any spoken line to the beat where it is said as: Name says: "line". Tie sound effects to the action in that beat.`
    : timeline === 'blocks'
      ? `Put speech in a "Dialogue:" block of short quoted lines with consistent speaker names, and sounds in a "Background Sound:" line.`
      : timeline === 'paragraph'
        ? `Weave the sound into the paragraph: spoken lines in double quotes, sound effects and ambience as concrete sounds.`
        : `Describe the sound in the same prose: quote speech, name concrete sound effects and the ambient soundscape.`;
  const lines = [`AUDIO (generated together with the video): write sound that fits the scene and the beats. ${where} Keep speech to about ${dialogueLineBudget(duration)} short line(s) for ${duration} seconds; a clip with no speaker needs none.`];
  if (mode === 'direct' && m.videoDialogue?.trim()) {
    lines.push(`USER DIALOGUE — use verbatim, keep the speaker names, place each line where it fits the action: ${m.videoDialogue.trim()}`);
  }
  if (mode === 'direct' && m.videoSfx?.trim()) {
    lines.push(`USER SOUND DIRECTION — include: ${m.videoSfx.trim()}`);
  }
  return lines.join('\n');
};

export interface VideoDirector {
  timeline: NonNullable<ModelProfile['videoTimeline']>;
  duration: number;
  /** Replaces VIDEO_MOTION_RULES in the system prompt. */
  rules: string;
  /** Deterministic opening line rendered in code; empty for dialects that do not use one. */
  header: string;
}

/**
 * Per-model "Director's Script" plan, or null when the target is not a video
 * model with a verified dialect (callers then keep the legacy motion rules).
 */
export const buildVideoDirector = (model: string, modifiers: PromptModifiers): VideoDirector | null => {
  const profile = lookupModelProfile(model, true);
  if (profile.mediaType !== 'video') return null;
  // Every video model gets the Director's Script; only verified dialects differ from the timestamp format.
  const timeline = profile.videoTimeline ?? 'timestamps';
  const duration = resolveVideoDuration(profile, modifiers.videoDuration);
  const isI2V = modifiers.videoInputType === 'i2v';
  const beats = buildTimelineSkeleton(duration);
  const lock = SHARED_LOCK(isI2V);
  const audio = audioRules(timeline, modifiers, modelHasAudio(profile, model), duration);
  const audioLine = audio.startsWith('AUDIO: none') ? '' : `, one line "Audio: ..." (ambience and music; speech and effects stay in the beats)`;
  let rules: string;
  let header = '';

  if (timeline === 'timestamps') {
    const labels = beats.map(b => `${beatLabel(b)}:`).join('\n');
    header = `${modifiers.aspectRatio ? `${modifiers.aspectRatio} ` : ''}cinematic video${isI2V ? ' based on the reference image' : ''}. Total duration ${duration} seconds.`;
    rules = `
[DIRECTOR'S SCRIPT — TIMESTAMPED]: The opening line (format, aspect ratio, total duration) is added for you — do not write it.
${lock}
Then write exactly these beats, in order, each on its own line starting with its label:
${labels}
Under each label write ONE beat: the camera move, the subject's action and what changes in the scene, in concrete, physically plausible motion verbs. Do not add, merge, rename or renumber labels.
After the last beat add one line "Visual Style: ..." (comma-separated look, lighting, motion treatment)${audioLine} and one line "Important: ..." stating continuity (same subject, outfit and setting throughout; smooth, continuous, natural motion) in positive wording. No other headers.
${audio}`;
  } else if (timeline === 'blocks') {
    rules = `
[DIRECTOR'S SCRIPT — LABELED BLOCKS]: The clip is ${duration} seconds (set by the API duration parameter, never in prose, so do not mention seconds).
${lock}
Format: one prose scene paragraph; then a line "Cinematography:" followed by "Camera shot: ..." (ONE camera setup); then "Mood: ..."; then "Actions:" followed by up to ${beats.length} short "- " bullets, one clear beat or gesture each, in order. Add a "Dialogue:" block of short quoted lines only if the user's concept contains speech. No timestamps, no other headers.
${audio}`;
  } else if (timeline === 'paragraph') {
    rules = `
[DIRECTOR'S SCRIPT — SINGLE PARAGRAPH]: Clip length about ${duration} seconds (not stated in the text).
${lock}
Write ONE flowing present-tense paragraph, no line breaks, in this order: the shot, the scene, the action, the character, the camera movement. Put any spoken line in double quotes. No timestamps, labels or headers.
${audio}`;
  } else {
    rules = `
[DIRECTOR'S SCRIPT — PROSE BEATS]: The clip is ${duration} seconds (set by the API duration parameter, so do not mention seconds).
${lock}
Write ONE continuous chronological arc in prose of at most ${beats.length} beats: opening framing and initial state, the primary action to its peak, then the resolve or camera settle. Connect beats with natural flow words ("as", "then", "while"). STRICTLY FORBIDDEN: timestamps, "Keyframe" markers, section headers, shot lists.
${audio}`;
  }
  return { timeline, duration, rules, header };
};

const KEYFRAME_LABEL = /^\s*keyframe\s*\d*\s*s?\s*[:.\-–]\s*/i;
const TIMESTAMP_LABEL = /^(\s*)\d+\s*[–-]\s*\d+\s*s\s*[:.\-–]\s*/i;

/** Drops labels the dialect does not allow while keeping the beat text. */
export const sanitizeVideoLine = (line: string, timeline: VideoDirector['timeline']): string => {
  const noKeyframe = line.replace(KEYFRAME_LABEL, '');
  return timeline === 'timestamps' ? noKeyframe : noKeyframe.replace(TIMESTAMP_LABEL, '$1');
};

/** Line-buffered pass-through that applies sanitizeVideoLine to a text stream. */
export async function* sanitizeVideoStream(stream: AsyncGenerator<string>, timeline: VideoDirector['timeline']): AsyncGenerator<string> {
  let buf = '';
  for await (const chunk of stream) {
    buf += chunk;
    const cut = buf.lastIndexOf('\n');
    if (cut < 0) continue;
    yield buf.slice(0, cut + 1).split('\n').map((l, i, a) => (i === a.length - 1 ? l : sanitizeVideoLine(l, timeline))).join('\n');
    buf = buf.slice(cut + 1);
  }
  if (buf) yield sanitizeVideoLine(buf, timeline);
}
