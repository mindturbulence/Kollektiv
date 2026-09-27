// OWNED BY: playback agent.
import type { ComposedFrame, Compositor, MediaEngine, PlaybackController, Project, Renderer } from '../types';
import { dispatch, getSnapshot, subscribe } from '../store';
import { evaluateVolume } from './keyframes';
import { closeIfBitmap, projectEnd } from './compositor';

interface ScheduledNode {
  stop(): void;
}

function closeFrameBitmaps(frame: ComposedFrame): void {
  for (const layer of frame.layers) closeIfBitmap(layer.source);
  for (const t of frame.transitions) {
    closeIfBitmap(t.from.source);
    closeIfBitmap(t.to.source);
  }
}

/** Samples the volume curve (base + keyframes + fades) for setValueCurveAtTime. */
function buildVolumeCurve(clipDuration: number, startLocal: number, remaining: number, evaluate: (localTime: number) => number): Float32Array {
  const points = Math.max(2, Math.min(200, Math.round(remaining * 20) + 1));
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const localTime = startLocal + (remaining * i) / (points - 1);
    curve[i] = evaluate(Math.min(clipDuration, localTime));
  }
  return curve;
}

export function createPlaybackController(opts: { media: MediaEngine; renderer: Renderer; compositor: Compositor }): PlaybackController {
  const { media, renderer, compositor } = opts;

  let audioCtx: AudioContext | null = null;
  let scheduledNodes: ScheduledNode[] = [];
  let anchorCtxTime = 0;
  let anchorPlayhead = 0;
  let rafId: number | null = null;
  let composeSeq = 0;

  function ensureAudioCtx(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  }

  function stopAudio(): void {
    for (const node of scheduledNodes) {
      try { node.stop(); } catch { /* already stopped/ended */ }
    }
    scheduledNodes = [];
  }

  function scheduleAudio(project: Project, fromTime: number): void {
    const ctx = ensureAudioCtx();
    for (const track of project.tracks) {
      if (track.muted || track.kind === 'text') continue;
      for (const clip of project.clips) {
        if (clip.trackId !== track.id || !clip.mediaId) continue;
        const remaining = clip.duration - Math.max(0, fromTime - clip.start);
        if (remaining <= 0) continue;
        const mediaItem = project.media.find(m => m.id === clip.mediaId);
        if (!mediaItem || !mediaItem.hasAudio) continue;

        const startLocal = Math.max(0, fromTime - clip.start);
        const when = ctx.currentTime + Math.max(0, clip.start - fromTime);

        void media.getAudioBuffer(mediaItem.id, mediaItem.file, ctx).then(buffer => {
          if (!buffer) return;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = clip.speed;
          const gain = ctx.createGain();
          const curve = buildVolumeCurve(clip.duration, startLocal, remaining, t => evaluateVolume(clip, t));
          gain.gain.setValueCurveAtTime(curve, when, remaining);
          src.connect(gain);
          gain.connect(ctx.destination);
          const sourceOffset = clip.inPoint + startLocal * clip.speed;
          const sourceDuration = remaining * clip.speed;
          src.start(when, sourceOffset, sourceDuration);
          scheduledNodes.push({ stop: () => src.stop() });
        });
      }
    }
  }

  function renderFrame(project: Project, time: number): void {
    const mySeq = ++composeSeq;
    compositor.compose(project, time).then(frame => {
      if (mySeq !== composeSeq) {
        closeFrameBitmaps(frame);
        return;
      }
      renderer.drawFrame(frame);
    }).catch(() => { /* dropped/failed compose; leave last drawn frame on screen */ });
  }

  function refresh(): void {
    const s = getSnapshot();
    if (!s.project) return;
    renderFrame(s.project, s.playhead);
  }

  function pause(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    stopAudio();
    if (getSnapshot().isPlaying) dispatch({ type: 'setPlaying', isPlaying: false });
  }

  function tick(): void {
    const s = getSnapshot();
    if (!s.project || !s.isPlaying || !audioCtx) return;
    const elapsed = audioCtx.currentTime - anchorCtxTime;
    const t = anchorPlayhead + elapsed;
    const end = projectEnd(s.project);
    if (t >= end) {
      dispatch({ type: 'setPlayhead', time: end });
      pause();
      renderFrame(s.project, end);
      return;
    }
    dispatch({ type: 'setPlayhead', time: t });
    renderFrame(s.project, t);
    rafId = requestAnimationFrame(tick);
  }

  function play(): void {
    const s = getSnapshot();
    if (!s.project || s.isPlaying) return;
    const ctx = ensureAudioCtx();
    const t0 = s.playhead;
    scheduleAudio(s.project, t0);
    anchorCtxTime = ctx.currentTime;
    anchorPlayhead = t0;
    dispatch({ type: 'setPlaying', isPlaying: true });
    rafId = requestAnimationFrame(tick);
  }

  function seek(time: number): void {
    const s = getSnapshot();
    if (!s.project) return;
    const clamped = Math.max(0, Math.min(projectEnd(s.project), time));
    dispatch({ type: 'setPlayhead', time: clamped });
    if (s.isPlaying && audioCtx) {
      stopAudio();
      scheduleAudio(s.project, clamped);
      anchorCtxTime = audioCtx.currentTime;
      anchorPlayhead = clamped;
    } else {
      renderFrame(s.project, clamped);
    }
  }

  const unsubscribe = subscribe(() => {
    if (!getSnapshot().isPlaying) refresh();
  });

  function dispose(): void {
    pause();
    unsubscribe();
    if (audioCtx) {
      void audioCtx.close();
      audioCtx = null;
    }
  }

  return { play, pause, seek, refresh, dispose };
}
