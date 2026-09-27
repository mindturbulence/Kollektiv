// OWNED BY: timeline-ui agent.
// Time ruler + track headers + clip rows. Reads the store via useEditorState;
// dispatches EditActions for every mutation (never mutates state directly).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dispatch } from '../../core/store';
import { useEditorSelector } from '../hooks/useEditorState';
import type { Clip, Marker, MediaItem, Track, TrackKind } from '../../core/types';
import { DEFAULT_TRANSFORM } from '../../core/types';
import { frameQuantize as frameSnap, findFreeSlot, trimBounds, findCuts } from '../../core/timeline/placement';
import { collectSnapPoints, snap } from '../../core/timeline/snapping';
import { computeSlip } from '../../core/timeline/slip-utils';
import { computeSlide } from '../../core/timeline/slide-utils';
import { applyEdit } from '../../core/actions/apply';
import { formatTimecode, clipsInViewport, canAcceptClip, clampZoom, keyframeMarkerTimes } from './timelineMath';
import { MEDIA_DRAG_MIME } from '../placement';
import { EyeIcon, LockIcon, LockOpenIcon, PlusIcon, ScissorsIcon } from '../../../components/icons';

// Stable fallbacks so memo/callback deps don't change every render without a project.
const NO_TRACKS: Track[] = [];
const NO_CLIPS: Clip[] = [];
const NO_MEDIA: MediaItem[] = [];
const NO_MARKERS: Marker[] = [];

const HEADER_W = 176;
const RULER_H = 28;
const MARKERS_H = 20;
const ROW_H = 56;
const EDGE_PX = 6;
const SNAP_PX = 8;

// ─── local drag preview state (one dispatch on pointerup) ───────────────────

type DragPreview =
  | { kind: 'move'; pointerId: number; clipIds: string[]; primaryClipId: string; deltaStart: number; targetTrackId: string | null; startClientX: number; startClientY: number; tracksTop: number }
  | { kind: 'trim'; pointerId: number; clipId: string; edge: 'start' | 'end'; time: number; ripple: boolean }
  | { kind: 'slip'; pointerId: number; clipId: string; startClientX: number; deltaSeconds: number }
  | { kind: 'slide'; pointerId: number; clipId: string; leftId: string; rightId: string; startClientX: number; deltaSeconds: number }
  | { kind: 'marquee'; pointerId: number; originX: number; originY: number; x: number; y: number }
  | null;

/** Left/right same-track neighbors touching `clip`'s edges, or null if there's a gap/track end. */
function adjacentClips(clips: Clip[], clip: Clip): { left: Clip | null; right: Clip | null } {
  const EPS = 1e-3;
  const onTrack = clips.filter(c => c.trackId === clip.trackId);
  const left = onTrack.find(c => Math.abs(c.start + c.duration - clip.start) <= EPS) ?? null;
  const right = onTrack.find(c => Math.abs(clip.start + clip.duration - c.start) <= EPS) ?? null;
  return { left, right };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const MuteIcon: React.FC<{ muted: boolean; className?: string }> = ({ muted, className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 9v6h4l5 5V4L8 9H4z" />
    {muted && <path d="M17 8l5 8M22 8l-5 8" />}
  </svg>
);

const Timeline: React.FC = () => {
  const project = useEditorSelector(s => s.project);
  const selectedClipIds = useEditorSelector(s => s.selectedClipIds);
  const playhead = useEditorSelector(s => s.playhead);
  const zoom = useEditorSelector(s => s.zoom);
  const tool = useEditorSelector(s => s.tool);
  const snapping = useEditorSelector(s => s.snapping);

  const rootRef = useRef<HTMLDivElement>(null);
  const headerColRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [drag, setDrag] = useState<DragPreview>(null);

  const tracks = project?.tracks ?? NO_TRACKS;
  const clips = project?.clips ?? NO_CLIPS;
  const media = project?.media ?? NO_MEDIA;
  const mediaById = useMemo(() => new Map<string, MediaItem>(media.map(m => [m.id, m])), [media]);
  const markers = project?.markers ?? NO_MARKERS;

  const maxEnd = useMemo(() => clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0), [clips]);
  const contentWidth = Math.max(viewportWidth, (maxEnd + 30) * zoom);
  const contentHeight = tracks.length * ROW_H;

  // Track viewport width for virtualization + zoom-around-cursor math.
  useEffect(() => {
    const el = tracksScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setViewportWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl/Cmd+wheel zoom around the cursor. Native listener: React's onWheel is
  // passive, so preventDefault() there would be silently ignored.
  useEffect(() => {
    const el = tracksScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const timeUnderCursor = (el.scrollLeft + cursorX) / zoom;
      const nextZoom = clampZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      dispatch({ type: 'setZoom', zoom: nextZoom });
      el.scrollLeft = Math.max(0, timeUnderCursor * nextZoom - cursorX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  const onTracksScroll = useCallback(() => {
    const el = tracksScrollRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    if (headerColRef.current) headerColRef.current.scrollTop = el.scrollTop;
  }, []);

  const clipStartTimeAt = useCallback((clientX: number): number => {
    const el = tracksScrollRef.current;
    const rect = el?.getBoundingClientRect();
    const x = (rect ? clientX - rect.left : clientX) + scrollLeft;
    return Math.max(0, x / zoom);
  }, [scrollLeft, zoom]);

  // ─── keyboard: split / delete / marker / undo·redo (only while focused) ───
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(e.target) || !project) return;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (mod) return; // don't shadow Ctrl+S etc.

    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      const targets = clips.filter(c => {
        if (selectedClipIds.length > 0 && !selectedClipIds.includes(c.id)) return false;
        const track = tracks.find(t => t.id === c.trackId);
        if (track?.locked) return false;
        return playhead > c.start && playhead < c.start + c.duration;
      });
      if (targets.length === 0) return;
      dispatch({
        type: 'batch',
        label: 'Split at playhead',
        actions: targets.map(c => ({ type: 'splitClip', clipId: c.id, time: playhead, newClipId: crypto.randomUUID() })),
      });
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      dispatch({ type: 'addMarker', marker: { id: crypto.randomUUID(), time: playhead, label: 'Marker' } });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedClipIds.length === 0) return;
      e.preventDefault();
      dispatch({ type: 'removeClips', clipIds: selectedClipIds, ripple: e.shiftKey });
      return;
    }
    const toolKey = e.key.toLowerCase();
    if (toolKey === 'v') { e.preventDefault(); dispatch({ type: 'setTool', tool: 'select' }); return; }
    if (toolKey === 'c') { e.preventDefault(); dispatch({ type: 'setTool', tool: 'razor' }); return; }
    if (toolKey === 'y') { e.preventDefault(); dispatch({ type: 'setTool', tool: 'slip' }); return; }
    if (toolKey === 'u') { e.preventDefault(); dispatch({ type: 'setTool', tool: 'slide' }); }
  }, [project, clips, tracks, selectedClipIds, playhead]);

  // ─── ruler: click/drag to scrub ────────────────────────────────────────────
  const onRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const seek = (clientX: number) => dispatch({ type: 'setPlayhead', time: frameSnap(clipStartTimeAt(clientX), project?.settings.fps ?? 30) });
    seek(e.clientX);
    const onMove = (ev: PointerEvent) => seek(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ─── clip drag: move ────────────────────────────────────────────────────────
  const beginMove = (e: React.PointerEvent, clip: Clip) => {
    const track = tracks.find(t => t.id === clip.trackId);
    if (track?.locked) return;
    let ids = selectedClipIds.includes(clip.id) ? selectedClipIds : [clip.id];
    if (e.shiftKey) {
      ids = selectedClipIds.includes(clip.id)
        ? selectedClipIds.filter(id => id !== clip.id)
        : [...selectedClipIds, clip.id];
      dispatch({ type: 'select', clipIds: ids });
      return; // shift-click toggles selection, doesn't start a drag
    }
    if (!selectedClipIds.includes(clip.id)) dispatch({ type: 'select', clipIds: ids });
    (e.target as Element).setPointerCapture(e.pointerId);
    const tracksTop = tracksScrollRef.current?.getBoundingClientRect().top ?? 0;
    setDrag({
      kind: 'move', pointerId: e.pointerId, clipIds: ids, primaryClipId: clip.id,
      deltaStart: 0, targetTrackId: null, startClientX: e.clientX, startClientY: e.clientY, tracksTop,
    });
  };

  const beginTrim = (e: React.PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    const track = tracks.find(t => t.id === clip.trackId);
    if (track?.locked) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: 'trim', pointerId: e.pointerId, clipId: clip.id, edge, time: edge === 'start' ? clip.start : clip.start + clip.duration, ripple: e.altKey });
  };

  // ─── clip drag: slip (own inPoint, fixed window) / slide (moves clip, trims neighbors) ──
  const beginSlip = (e: React.PointerEvent, clip: Clip) => {
    const track = tracks.find(t => t.id === clip.trackId);
    const media = clip.mediaId ? mediaById.get(clip.mediaId) : undefined;
    if (track?.locked || !media || media.kind === 'image') return; // no bounded source window to slip
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: 'slip', pointerId: e.pointerId, clipId: clip.id, startClientX: e.clientX, deltaSeconds: 0 });
  };

  const beginSlide = (e: React.PointerEvent, clip: Clip) => {
    const track = tracks.find(t => t.id === clip.trackId);
    if (track?.locked) return;
    const { left, right } = adjacentClips(clips, clip);
    if (!left || !right) return; // no open-end slide; use trim instead
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: 'slide', pointerId: e.pointerId, clipId: clip.id, leftId: left.id, rightId: right.id, startClientX: e.clientX, deltaSeconds: 0 });
  };

  const onClipPointerDown = (e: React.PointerEvent, clip: Clip) => {
    e.stopPropagation();
    if (tool === 'razor') return; // handled on pointerup as a click, not a drag
    if (tool === 'slip') { beginSlip(e, clip); return; }
    if (tool === 'slide') { beginSlide(e, clip); return; }
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX <= EDGE_PX) beginTrim(e, clip, 'start');
    else if (rect.width - localX <= EDGE_PX) beginTrim(e, clip, 'end');
    else beginMove(e, clip);
  };

  const onClipPointerUpRazor = (e: React.PointerEvent, clip: Clip) => {
    if (tool !== 'razor') return;
    e.stopPropagation();
    const track = tracks.find(t => t.id === clip.trackId);
    if (track?.locked) return;
    const time = frameSnap(clipStartTimeAt(e.clientX), project?.settings.fps ?? 30);
    if (time <= clip.start || time >= clip.start + clip.duration) return;
    dispatch({ type: 'splitClip', clipId: clip.id, time, newClipId: crypto.randomUUID() });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      if (drag.kind === 'move') {
        const rawDelta = (ev.clientX - drag.startClientX) / zoom;
        const dragged = clips.filter(c => drag.clipIds.includes(c.id));
        let deltaStart = rawDelta;
        if (dragged.length > 0) {
          const minOrigStart = Math.min(...dragged.map(c => c.start));
          if (minOrigStart + deltaStart < 0) deltaStart = -minOrigStart;
          if (snapping && drag.clipIds.length === 1 && project) {
            const c = dragged[0];
            const excluded = new Set(drag.clipIds);
            const points = collectSnapPoints(project, playhead, excluded);
            const threshold = SNAP_PX / zoom;
            const startSnap = snap(c.start + deltaStart, points, threshold);
            const endSnap = snap(c.start + c.duration + deltaStart, points, threshold);
            if (startSnap.snappedTo !== null) deltaStart = startSnap.time - c.start;
            else if (endSnap.snappedTo !== null) deltaStart = endSnap.time - c.start - c.duration;
          }
        }
        let targetTrackId: string | null = null;
        if (drag.clipIds.length === 1) {
          const c = dragged[0];
          const originTrack = tracks.find(t => t.id === c.trackId);
          const idx = Math.floor((ev.clientY - drag.tracksTop) / ROW_H);
          const candidate = tracks[idx];
          targetTrackId = candidate && canAcceptClip(candidate, originTrack?.kind ?? candidate.kind) ? candidate.id : null;
        }
        setDrag({ ...drag, deltaStart, targetTrackId });
      } else if (drag.kind === 'trim') {
        const clip = clips.find(c => c.id === drag.clipId);
        if (!clip) return;
        const m = clip.mediaId ? mediaById.get(clip.mediaId) : undefined;
        const bounds = trimBounds(clip, drag.edge, m);
        const fps = project?.settings.fps ?? 30;
        const raw = frameSnap(clipStartTimeAt(ev.clientX), fps);
        const time = Math.min(bounds.max, Math.max(bounds.min, raw));
        setDrag({ ...drag, time, ripple: ev.altKey });
      } else if (drag.kind === 'slip' || drag.kind === 'slide') {
        setDrag({ ...drag, deltaSeconds: (ev.clientX - drag.startClientX) / zoom });
      } else if (drag.kind === 'marquee') {
        const rect = tracksScrollRef.current?.getBoundingClientRect();
        setDrag({ ...drag, x: (ev.clientX - (rect?.left ?? 0)) + scrollLeft, y: ev.clientY - (rect?.top ?? 0) + (tracksScrollRef.current?.scrollTop ?? 0) });
      }
    };
    const finish = (commit: boolean) => {
      if (commit && drag.kind === 'move') {
        const dragged = clips.filter(c => drag.clipIds.includes(c.id));
        if (drag.deltaStart !== 0 || (drag.targetTrackId && drag.targetTrackId !== drag.primaryClipId)) {
          if (dragged.length === 1) {
            const c = dragged[0];
            dispatch({ type: 'moveClip', clipId: c.id, start: Math.max(0, c.start + drag.deltaStart), trackId: drag.targetTrackId ?? c.trackId });
          } else if (dragged.length > 1 && drag.deltaStart !== 0) {
            dispatch({
              type: 'batch', label: 'Move clips',
              actions: dragged.map(c => ({ type: 'moveClip', clipId: c.id, start: Math.max(0, c.start + drag.deltaStart), trackId: c.trackId })),
            });
          }
        }
      } else if (commit && drag.kind === 'trim') {
        dispatch({ type: 'trimClip', clipId: drag.clipId, edge: drag.edge, time: drag.time, ripple: drag.ripple });
      } else if (commit && drag.kind === 'slip') {
        const clip = clips.find(c => c.id === drag.clipId);
        const media = clip?.mediaId ? mediaById.get(clip.mediaId) : undefined;
        const actions = clip ? computeSlip(clip, media, drag.deltaSeconds) : [];
        if (actions.length > 0) dispatch(actions[0]);
      } else if (commit && drag.kind === 'slide') {
        const clip = clips.find(c => c.id === drag.clipId);
        const left = clips.find(c => c.id === drag.leftId) ?? null;
        const right = clips.find(c => c.id === drag.rightId) ?? null;
        const actions = clip && project ? computeSlide(project, clip, left, right, drag.deltaSeconds) : [];
        if (actions.length > 0) dispatch({ type: 'batch', label: 'Slide clip', actions });
      } else if (commit && drag.kind === 'marquee') {
        const lo = { x: Math.min(drag.originX, drag.x), y: Math.min(drag.originY, drag.y) };
        const hi = { x: Math.max(drag.originX, drag.x), y: Math.max(drag.originY, drag.y) };
        const hitIds = tracks.flatMap((t, idx) => {
          const top = idx * ROW_H;
          if (top + ROW_H < lo.y || top > hi.y) return [];
          return clips.filter(c => c.trackId === t.id && c.start * zoom <= hi.x && (c.start + c.duration) * zoom >= lo.x).map(c => c.id);
        });
        dispatch({ type: 'select', clipIds: hitIds });
      }
      setDrag(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const onTracksBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'select') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = tracksScrollRef.current?.getBoundingClientRect();
    const x = (e.clientX - (rect?.left ?? 0)) + scrollLeft;
    const y = e.clientY - (rect?.top ?? 0) + (tracksScrollRef.current?.scrollTop ?? 0);
    setDrag({ kind: 'marquee', pointerId: e.pointerId, originX: x, originY: y, x, y });
  };

  // ─── media-bin drop: add a clip on the target track at the drop time ──────
  const onDropMedia = (e: React.DragEvent<HTMLDivElement>, track: Track) => {
    const mediaId = e.dataTransfer.getData(MEDIA_DRAG_MIME);
    if (!mediaId || !project) return;
    e.preventDefault();
    const item = mediaById.get(mediaId);
    if (!item) return;
    const requiredKind: TrackKind = item.kind === 'audio' ? 'audio' : 'video';
    if (track.kind !== requiredKind || track.locked) return;
    const dropTime = frameSnap(clipStartTimeAt(e.clientX), project.settings.fps);
    const start = findFreeSlot(project, track.id, item.duration, dropTime);
    dispatch({
      type: 'addClip',
      clip: {
        id: crypto.randomUUID(), trackId: track.id, mediaId: item.id, start, duration: item.duration,
        inPoint: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
        transform: { ...DEFAULT_TRANSFORM }, keyframes: [], effects: [],
      },
    });
  };

  const cutsByTrack = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findCuts>>();
    for (const t of tracks) map.set(t.id, findCuts(clips.filter(c => c.trackId === t.id)));
    return map;
  }, [tracks, clips]);

  // Slip doesn't move the clip; preview its new inPoint instead of position.
  const slipPreviewInPoint = useMemo(() => {
    if (drag?.kind !== 'slip') return null;
    const clip = clips.find(c => c.id === drag.clipId);
    if (!clip) return null;
    const media = clip.mediaId ? mediaById.get(clip.mediaId) : undefined;
    const actions = computeSlip(clip, media, drag.deltaSeconds);
    return actions.length > 0 && actions[0].type === 'updateClip' ? (actions[0].patch.inPoint as number) : clip.inPoint;
  }, [drag, clips, mediaById]);

  // Slide previews by actually applying the clamped batch to a scratch
  // project — reuses applyEdit's exact clamp/overlap rules instead of
  // re-deriving them, so the preview and the eventual commit can't disagree.
  const slidePreviewClips = useMemo(() => {
    if (!project || drag?.kind !== 'slide') return null;
    const clip = clips.find(c => c.id === drag.clipId);
    const left = clips.find(c => c.id === drag.leftId) ?? null;
    const right = clips.find(c => c.id === drag.rightId) ?? null;
    if (!clip || !left || !right) return null;
    const actions = computeSlide(project, clip, left, right, drag.deltaSeconds);
    if (actions.length === 0) return null;
    return applyEdit(project, { type: 'batch', actions, label: 'preview' }).project.clips;
  }, [project, drag, clips]);

  if (!project) {
    return <div className="h-full w-full flex items-center justify-center text-xs text-base-content/40" data-testid="ve-timeline">No project loaded</div>;
  }

  const fps = project.settings.fps;

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full w-full bg-base-200 outline-none"
      data-testid="ve-timeline"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* Toolbar */}
      <div className="h-7 flex-shrink-0 flex items-center gap-2 px-2 border-b border-base-content/10">
        <button
          type="button"
          aria-label="Select tool"
          aria-pressed={tool === 'select'}
          className={`px-1.5 py-0.5 text-2xs font-mono uppercase border ${tool === 'select' ? 'border-primary text-primary' : 'border-base-content/15 text-base-content/60'} focus-visible:ring-1 focus-visible:ring-primary`}
          onClick={() => dispatch({ type: 'setTool', tool: 'select' })}
        >
          Select
        </button>
        <button
          type="button"
          aria-label="Razor tool"
          aria-pressed={tool === 'razor'}
          className={`px-1.5 py-0.5 text-2xs font-mono uppercase border flex items-center gap-1 ${tool === 'razor' ? 'border-primary text-primary' : 'border-base-content/15 text-base-content/60'} focus-visible:ring-1 focus-visible:ring-primary`}
          onClick={() => dispatch({ type: 'setTool', tool: 'razor' })}
        >
          <ScissorsIcon className="w-3 h-3" /> Razor
        </button>
        <button
          type="button"
          aria-label={snapping ? 'Disable snapping' : 'Enable snapping'}
          aria-pressed={snapping}
          className={`px-1.5 py-0.5 text-2xs font-mono uppercase border ${snapping ? 'border-primary text-primary' : 'border-base-content/15 text-base-content/60'}`}
          onClick={() => dispatch({ type: 'setSnapping', snapping: !snapping })}
        >
          Snap
        </button>
        <div className="flex-1" />
        <span className="text-2xs font-mono text-base-content/50">{formatTimecode(playhead, fps)}</span>
      </div>

      {/* Ruler */}
      <div className="flex-shrink-0 flex border-b border-base-content/10" style={{ height: RULER_H }}>
        <div className="flex-shrink-0 border-r border-base-content/10" style={{ width: HEADER_W }} />
        <div className="flex-1 overflow-hidden relative cursor-pointer" onPointerDown={onRulerPointerDown}>
          <div className="absolute inset-y-0" style={{ width: contentWidth, transform: `translateX(${-scrollLeft}px)` }}>
            <RulerTicks zoom={zoom} fps={fps} contentWidth={contentWidth} />
            <div className="absolute top-0 bottom-0 w-px bg-primary z-raised" style={{ left: playhead * zoom }} />
          </div>
        </div>
      </div>

      {/* Headers + tracks */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div ref={headerColRef} className="flex-shrink-0 overflow-y-hidden border-r border-base-content/10" style={{ width: HEADER_W }}>
          <div style={{ height: MARKERS_H }} />
          {tracks.map(track => (
            <TrackHeader key={track.id} track={track} />
          ))}
          <AddTrackRow />
        </div>

        <div
          ref={tracksScrollRef}
          className="flex-1 overflow-auto relative"
          onScroll={onTracksScroll}
          onPointerDown={onTracksBackgroundPointerDown}
        >
          <div className="relative" style={{ width: contentWidth, height: Math.max(contentHeight, 1) + MARKERS_H }}>
            <MarkersRow markers={markers} zoom={zoom} width={contentWidth} />
            {tracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                top={idx * ROW_H + MARKERS_H}
                track={track}
                clips={clipsInViewport(clips.filter(c => c.trackId === track.id), zoom, scrollLeft, viewportWidth, 400)}
                mediaById={mediaById}
                zoom={zoom}
                fps={fps}
                selectedClipIds={selectedClipIds}
                tool={tool}
                drag={drag}
                slipPreviewInPoint={slipPreviewInPoint}
                slidePreviewClips={slidePreviewClips}
                onClipPointerDown={onClipPointerDown}
                onClipPointerUpRazor={onClipPointerUpRazor}
                onKeyframeClick={(time) => dispatch({ type: 'setPlayhead', time })}
                cuts={cutsByTrack.get(track.id) ?? []}
                transitions={project.transitions}
                onDropMedia={onDropMedia}
              />
            ))}
            <div className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none z-raised" style={{ left: playhead * zoom }} />
            {drag?.kind === 'marquee' && (
              <div
                className="absolute border border-primary/70 bg-primary/10 pointer-events-none z-raised"
                style={{
                  left: Math.min(drag.originX, drag.x), top: Math.min(drag.originY, drag.y),
                  width: Math.abs(drag.x - drag.originX), height: Math.abs(drag.y - drag.originY),
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ruler ticks ────────────────────────────────────────────────────────────

const RulerTicks: React.FC<{ zoom: number; fps: number; contentWidth: number }> = ({ zoom, fps, contentWidth }) => {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
  const interval = candidates.find(c => c * zoom >= 60) ?? 600;
  const count = Math.ceil(contentWidth / (interval * zoom)) + 1;
  return (
    <>
      {Array.from({ length: count }, (_, i) => i * interval).map(t => (
        <div key={t} className="absolute top-0 bottom-0 flex items-end" style={{ left: t * zoom }}>
          <div className="w-px h-2 bg-base-content/30" />
          <span className="text-2xs font-mono text-base-content/50 pl-1 pb-0.5 whitespace-nowrap">{formatTimecode(t, fps)}</span>
        </div>
      ))}
    </>
  );
};

// ─── markers row ────────────────────────────────────────────────────────────

const MarkersRow: React.FC<{ markers: { id: string; time: number; label: string }[]; zoom: number; width: number }> = ({ markers, zoom, width }) => (
  <div className="absolute top-0 left-0 border-b border-base-content/10" style={{ height: MARKERS_H, width }} role="row" aria-label="Markers">
    {markers.map(m => (
      <div
        key={m.id}
        role="img"
        aria-label={`Marker: ${m.label}`}
        title={m.label}
        className="absolute top-1 w-2 h-2 -translate-x-1/2 rotate-45 bg-warning"
        style={{ left: m.time * zoom }}
      />
    ))}
  </div>
);

// ─── track header ───────────────────────────────────────────────────────────

const TrackHeader: React.FC<{ track: Track }> = ({ track }) => (
  <div className="flex items-center gap-1.5 px-2 border-b border-base-content/5" style={{ height: ROW_H }}>
    <span className="flex-1 min-w-0 truncate text-xs font-mono" title={track.name}>{track.name}</span>
    <button
      type="button"
      aria-label={track.muted ? 'Unmute track' : 'Mute track'}
      aria-pressed={track.muted}
      className={`p-0.5 focus-visible:ring-1 focus-visible:ring-primary ${track.muted ? 'text-error' : 'text-base-content/60 hover:text-base-content'}`}
      onClick={() => dispatch({ type: 'updateTrack', trackId: track.id, patch: { muted: !track.muted } })}
    >
      <MuteIcon muted={track.muted} className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      aria-label={track.hidden ? 'Show track' : 'Hide track'}
      aria-pressed={track.hidden}
      className="p-0.5 text-base-content/60 hover:text-base-content focus-visible:ring-1 focus-visible:ring-primary"
      onClick={() => dispatch({ type: 'updateTrack', trackId: track.id, patch: { hidden: !track.hidden } })}
    >
      <EyeIcon className={`w-3.5 h-3.5 ${track.hidden ? 'opacity-30' : ''}`} />
    </button>
    <button
      type="button"
      aria-label={track.locked ? 'Unlock track' : 'Lock track'}
      aria-pressed={track.locked}
      className="p-0.5 text-base-content/60 hover:text-base-content focus-visible:ring-1 focus-visible:ring-primary"
      onClick={() => dispatch({ type: 'updateTrack', trackId: track.id, patch: { locked: !track.locked } })}
    >
      {track.locked ? <LockIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
    </button>
  </div>
);

const AddTrackRow: React.FC = () => {
  const add = (kind: TrackKind) => dispatch({
    type: 'addTrack',
    track: { id: crypto.randomUUID(), kind, name: `${kind[0].toUpperCase()}${kind.slice(1)} track`, muted: false, hidden: false, locked: false },
  });
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      {(['video', 'audio', 'text'] as TrackKind[]).map(kind => (
        <button
          key={kind}
          type="button"
          aria-label={`Add ${kind} track`}
          title={`Add ${kind} track`}
          className="p-0.5 text-base-content/50 hover:text-primary focus-visible:ring-1 focus-visible:ring-primary"
          onClick={() => add(kind)}
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
};

// ─── track row + clips ──────────────────────────────────────────────────────

const TrackRow: React.FC<{
  top: number;
  track: Track;
  clips: Clip[];
  mediaById: Map<string, MediaItem>;
  zoom: number;
  fps: number;
  selectedClipIds: string[];
  tool: string;
  drag: DragPreview;
  slipPreviewInPoint: number | null;
  slidePreviewClips: Clip[] | null;
  onClipPointerDown: (e: React.PointerEvent, clip: Clip) => void;
  onClipPointerUpRazor: (e: React.PointerEvent, clip: Clip) => void;
  onKeyframeClick: (time: number) => void;
  cuts: ReturnType<typeof findCuts>;
  transitions: { id: string; fromClipId: string; toClipId: string }[];
  onDropMedia: (e: React.DragEvent<HTMLDivElement>, track: Track) => void;
}> = ({ top, track, clips, mediaById, zoom, fps, selectedClipIds, tool, drag, slipPreviewInPoint, slidePreviewClips, onClipPointerDown, onClipPointerUpRazor, onKeyframeClick, cuts, transitions, onDropMedia }) => (
  <div
    className="absolute left-0 right-0 border-b border-base-content/5"
    style={{ top, height: ROW_H }}
    data-testid={`ve-track-row-${track.id}`}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => onDropMedia(e, track)}
  >
    {clips.map(clip => {
      const isDraggingThis = drag?.kind === 'move' && drag.clipIds.includes(clip.id);
      const isPrimaryCrossTrack = drag?.kind === 'move' && drag.primaryClipId === clip.id && drag.targetTrackId && drag.targetTrackId !== track.id;
      const displayStart = isDraggingThis && drag?.kind === 'move' ? clip.start + drag.deltaStart : clip.start;
      const isTrimmingThis = drag?.kind === 'trim' && drag.clipId === clip.id;
      const slidePreview = slidePreviewClips?.find(c => c.id === clip.id);
      let start = isTrimmingThis && drag?.kind === 'trim' && drag.edge === 'start' ? drag.time : displayStart;
      let duration = isTrimmingThis && drag?.kind === 'trim'
        ? (drag.edge === 'start' ? clip.start + clip.duration - drag.time : drag.time - clip.start)
        : clip.duration;
      if (slidePreview) {
        start = slidePreview.start;
        duration = slidePreview.duration;
      }
      const isSlipping = drag?.kind === 'slip' && drag.clipId === clip.id;
      const slipLabel = isSlipping && slipPreviewInPoint !== null ? `In ${formatTimecode(slipPreviewInPoint, fps)}` : null;
      return (
        <ClipBlock
          key={clip.id}
          clip={clip}
          media={clip.mediaId ? mediaById.get(clip.mediaId) : undefined}
          left={start * zoom}
          width={Math.max(2, duration * zoom)}
          zoom={zoom}
          fps={fps}
          selected={selectedClipIds.includes(clip.id)}
          hidden={isPrimaryCrossTrack ? true : false}
          faded={isDraggingThis}
          razorMode={tool === 'razor'}
          slipLabel={slipLabel}
          onPointerDown={onClipPointerDown}
          onPointerUpRazor={onClipPointerUpRazor}
          onKeyframeClick={onKeyframeClick}
        />
      );
    })}
    {cuts.map(cut => {
      const hasTransition = transitions.some(t => t.fromClipId === cut.fromClipId && t.toClipId === cut.toClipId);
      return (
        <button
          key={`${cut.fromClipId}-${cut.toClipId}`}
          type="button"
          aria-label={hasTransition ? 'Crossfade transition' : 'Add crossfade transition'}
          title={hasTransition ? 'Crossfade' : 'Double-click to add a 0.5s crossfade'}
          className={`absolute top-1 bottom-1 w-2.5 -translate-x-1/2 z-raised border border-base-content/20 ${hasTransition ? 'bg-accent' : 'bg-base-content/10 hover:bg-base-content/20'}`}
          style={{ left: cut.time * zoom }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (hasTransition) return;
            dispatch({
              type: 'addTransition',
              transition: { id: crypto.randomUUID(), type: 'crossfade', fromClipId: cut.fromClipId, toClipId: cut.toClipId, duration: 0.5 },
            });
          }}
        />
      );
    })}
  </div>
);

// ─── clip block ─────────────────────────────────────────────────────────────

const ClipBlock: React.FC<{
  clip: Clip;
  media: MediaItem | undefined;
  left: number;
  width: number;
  zoom: number;
  fps: number;
  selected: boolean;
  hidden: boolean;
  faded: boolean;
  razorMode: boolean;
  slipLabel: string | null;
  onPointerDown: (e: React.PointerEvent, clip: Clip) => void;
  onPointerUpRazor: (e: React.PointerEvent, clip: Clip) => void;
  onKeyframeClick: (time: number) => void;
}> = ({ clip, media, left, width, zoom, fps, selected, hidden, faded, razorMode, slipLabel, onPointerDown, onPointerUpRazor, onKeyframeClick }) => {
  if (hidden) return null;
  const label = clip.text?.content ?? media?.name ?? 'Clip';
  const keyframeTimes = keyframeMarkerTimes(clip.keyframes, clip.duration, fps);
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={`Clip: ${label}`}
      aria-selected={selected}
      data-testid={`ve-clip-${clip.id}`}
      data-clip-id={clip.id}
      className={`absolute top-1 bottom-1 overflow-hidden border text-2xs font-mono select-none cursor-grab focus-visible:ring-1 focus-visible:ring-primary
        ${selected ? 'border-primary ring-1 ring-primary/50' : 'border-base-content/15'}
        ${faded ? 'opacity-60' : ''}
        ${razorMode ? 'cursor-crosshair' : ''}
        bg-base-300`}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, clip)}
      onPointerUp={(e) => onPointerUpRazor(e, clip)}
    >
      {media?.waveform ? (
        <WaveformThumb waveform={media.waveform} />
      ) : media?.thumbnail ? (
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `url(${media.thumbnail})`, backgroundSize: 'cover' }} />
      ) : null}
      <span className="absolute left-1 top-0.5 truncate max-w-[90%] text-base-content/80 bg-base-300/70 px-0.5">{label}</span>
      {slipLabel && (
        <span className="absolute right-1 top-0.5 text-info bg-base-300/70 px-0.5">{slipLabel}</span>
      )}
      {keyframeTimes.map(t => (
        <div
          key={t}
          role="button"
          tabIndex={-1}
          aria-label={`Keyframe at ${formatTimecode(clip.start + t, fps)}`}
          title={formatTimecode(clip.start + t, fps)}
          className="absolute bottom-0.5 w-1.5 h-1.5 -translate-x-1/2 rotate-45 bg-info z-raised"
          style={{ left: t * zoom }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onKeyframeClick(clip.start + t);
          }}
        />
      ))}
    </div>
  );
};

const WaveformThumb: React.FC<{ waveform: Float32Array }> = ({ waveform }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'currentColor';
    const n = waveform.length;
    if (n === 0) return;
    const step = Math.max(1, Math.floor(n / canvas.width));
    for (let x = 0; x < canvas.width; x++) {
      const i = Math.floor((x / canvas.width) * n);
      let peak = 0;
      for (let j = i; j < Math.min(n, i + step); j++) peak = Math.max(peak, waveform[j] ?? 0);
      const h = Math.max(1, peak * canvas.height);
      ctx.fillRect(x, (canvas.height - h) / 2, 1, h);
    }
  }, [waveform]);
  return <canvas ref={canvasRef} width={200} height={ROW_H - 8} className="absolute inset-0 w-full h-full text-base-content/40" />;
};

export default Timeline;
