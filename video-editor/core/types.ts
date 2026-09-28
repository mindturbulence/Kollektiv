// ─── Kollektiv Video Editor — shared contract ────────────────────────────────
// Every module codes against these types. Change them only in a coordinated
// step (video-editor plan §7, git history 3bc6f65). Times are seconds
// (float) on the timeline clock; frame snapping uses ProjectSettings.fps.

// ─── Project model ────────────────────────────────────────────────────────────

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  /** Source blob, kept in memory; persisted by autosave. */
  file: Blob;
  /** Seconds; images get a default of 5. */
  duration: number;
  width: number;
  height: number;
  fps?: number;
  hasAudio: boolean;
  /** Small data URL for the media bin; optional until generated. */
  thumbnail?: string;
  /** Peak amplitudes 0..1, one per `WAVEFORM_BUCKET_SECONDS`. */
  waveform?: Float32Array;
}

export const WAVEFORM_BUCKET_SECONDS = 0.01;

export type TrackKind = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface Transform {
  /** Centre offset from canvas centre, in project pixels. */
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
  opacity: number;  // 0..1
  fit: 'contain' | 'cover' | 'stretch';
}

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' };

export interface TextStyle {
  fontFamily: string;
  fontSize: number; // project pixels
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: boolean;
  background?: string;
}

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export interface Keyframe {
  id: string;
  /** Seconds relative to clip start. */
  time: number;
  property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';
  value: number;
  easing: EasingType;
}

export interface Clip {
  id: string;
  trackId: string;
  /** Undefined for text clips. */
  mediaId?: string;
  /** Timeline position (s). */
  start: number;
  /** Timeline length (s) — already accounts for speed. */
  duration: number;
  /** Source offset (s) where playback begins. */
  inPoint: number;
  speed: number; // 1 = normal
  volume: number; // 0..2, 1 = unity
  fadeIn: number;  // s
  fadeOut: number; // s
  transform: Transform;
  keyframes: Keyframe[];
  effects: Effect[];
  text?: { content: string; style: TextStyle };
}

export interface Effect {
  id: string;
  /** Registry key, e.g. 'brightness', 'blur', 'lut'. */
  type: string;
  params: Record<string, number | string | boolean>;
  enabled: boolean;
}

export type TransitionType = 'crossfade' | 'dip-black' | 'dip-white' | 'wipe-left' | 'wipe-right' | 'slide-left' | 'slide-right';

/** A transition sits on the cut between two adjacent clips on the same track. */
export interface Transition {
  id: string;
  type: TransitionType;
  fromClipId: string;
  toClipId: string;
  duration: number; // s, centred on the cut
}

export interface Marker {
  id: string;
  time: number;
  label: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  media: MediaItem[];
  /** Order = z-order for video/text (index 0 is the bottom layer). */
  tracks: Track[];
  clips: Clip[];
  transitions: Transition[];
  markers: Marker[];
  createdAt: number;
  updatedAt: number;
}

// ─── Editor state (store) ─────────────────────────────────────────────────────

export type EditorTool = 'select' | 'razor' | 'slip' | 'slide';

export interface EditorState {
  project: Project | null;
  selectedClipIds: string[];
  playhead: number;   // s
  isPlaying: boolean;
  zoom: number;       // timeline pixels per second
  tool: EditorTool;
  snapping: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

// ─── Edit actions (undoable; see core/actions) ────────────────────────────────

export type EditAction =
  | { type: 'addMedia'; media: MediaItem }
  | { type: 'removeMedia'; mediaId: string }
  | { type: 'addTrack'; track: Track; index?: number }
  | { type: 'removeTrack'; trackId: string }
  | { type: 'updateTrack'; trackId: string; patch: Partial<Omit<Track, 'id'>> }
  | { type: 'addClip'; clip: Clip }
  | { type: 'removeClips'; clipIds: string[]; ripple: boolean }
  | { type: 'moveClip'; clipId: string; start: number; trackId: string }
  | { type: 'trimClip'; clipId: string; edge: 'start' | 'end'; time: number; ripple: boolean }
  | { type: 'splitClip'; clipId: string; time: number; newClipId: string }
  | { type: 'updateClip'; clipId: string; patch: Partial<Omit<Clip, 'id' | 'trackId'>> }
  | { type: 'addTransition'; transition: Transition }
  | { type: 'removeTransition'; transitionId: string }
  | { type: 'updateTransition'; transitionId: string; patch: Partial<Omit<Transition, 'id'>> }
  | { type: 'addMarker'; marker: Marker }
  | { type: 'removeMarker'; markerId: string }
  | { type: 'updateSettings'; patch: Partial<ProjectSettings> }
  | { type: 'batch'; actions: EditAction[]; label: string };

/** Non-undoable UI actions. */
export type UiAction =
  | { type: 'loadProject'; project: Project | null }
  | { type: 'setPlayhead'; time: number }
  | { type: 'setPlaying'; isPlaying: boolean }
  | { type: 'select'; clipIds: string[] }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setTool'; tool: EditorTool }
  | { type: 'setSnapping'; snapping: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'markSaved' };

export type EditorAction = EditAction | UiAction;

// ─── Module interfaces ────────────────────────────────────────────────────────

/** core/media — decode via mediabunny. */
export interface MediaProbe {
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  fps?: number;
  hasAudio: boolean;
}

export interface MediaEngine {
  probe(file: Blob, name: string): Promise<MediaProbe>;
  /** Decoded frame at source time (s). Caller owns and must close() it. */
  getVideoFrame(mediaId: string, file: Blob, sourceTime: number): Promise<ImageBitmap | null>;
  /** Decoded audio for the whole source, for the WebAudio mixer and waveforms. */
  getAudioBuffer(mediaId: string, file: Blob, ctx: BaseAudioContext): Promise<AudioBuffer | null>;
  thumbnail(file: Blob, kind: MediaKind, sourceTime?: number): Promise<string | undefined>;
  waveform(buffer: AudioBuffer): Float32Array;
  dispose(mediaId?: string): void;
}

/** A single layer to draw for one output frame, bottom-up. */
export interface RenderLayer {
  source: ImageBitmap | { text: string; style: TextStyle };
  transform: Transform;
  effects: Effect[];
}

/** core/render — Canvas2D baseline; WebGPU later behind the same interface. */
export interface Renderer {
  readonly kind: 'canvas2d' | 'webgpu';
  resize(width: number, height: number): void;
  /** Draws a full frame: background, then layers, then the transition blend if any. */
  drawFrame(frame: ComposedFrame): void;
  /** Snapshot of the current canvas for export encoders. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  dispose(): void;
}

export interface ComposedFrame {
  background: string;
  layers: RenderLayer[];
  /** When the playhead is inside a transition window on some track. */
  transitions: Array<{ type: TransitionType; progress: number; from: RenderLayer; to: RenderLayer }>;
}

/** core/playback — resolves which layers are visible at time t. */
export interface Compositor {
  compose(project: Project, time: number): Promise<ComposedFrame>;
}

export type ExportContainer = 'mp4' | 'webm';

export interface ExportOptions {
  container: ExportContainer;
  width: number;
  height: number;
  fps: number;
  videoBitrate: number; // bps
  audioBitrate: number; // bps
  range?: { start: number; end: number };
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding-audio' | 'finalizing' | 'fallback-ffmpeg';
  progress: number; // 0..1
}

/** core/playback — drives the clock; reads/writes the store (playhead, isPlaying). */
export interface PlaybackController {
  play(): void;
  pause(): void;
  seek(time: number): void;
  /** Re-render the current playhead frame (after edits while paused). */
  refresh(): void;
  dispose(): void;
}

/** How the page is opened from elsewhere in Kollektiv (assets, gallery). */
export type VideoEditorOpenPayload =
  | { kind: 'files'; files: Array<{ blob: Blob; name: string }> }
  | { kind: 'project'; projectId: string };

/** core/export */
export interface Exporter {
  export(project: Project, opts: ExportOptions, onProgress: (p: ExportProgress) => void, signal: AbortSignal): Promise<Blob>;
}
