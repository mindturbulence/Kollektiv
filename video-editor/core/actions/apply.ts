// OWNED BY: actions agent. Pure, immutable applyEdit for every EditAction.
//
// Contracts enforced here:
// - No-op (unknown id, locked track, invalid bounds) returns the SAME
//   `project` reference so callers (store.ts) can detect it and skip history.
// - Inverses are built from SNAPSHOTS of the entities an action touches, not
//   from reversed arithmetic. Reversed math drifts under floats and its
//   guards (overlap, lock, bounds) can reject the inverse mid-undo; a
//   snapshot restore ("remove what changed, re-add exactly what was there")
//   sidesteps both problems.
// - `clips`, `transitions`, `markers` are re-sorted after every mutating
//   action (start/id, id, time/id) so structurally-equal projects are also
//   deep-equal regardless of how an edit happened to build its array.
//   `media` has no such key — see the removeMedia comment below.

import type {
  Clip,
  EditAction,
  MediaItem,
  Project,
  ProjectSettings,
  Track,
  Transition,
} from '../types';

const EPS = 1e-6;

function findTrack(project: Project, id: string): Track | undefined {
  return project.tracks.find(t => t.id === id);
}
function findClip(project: Project, id: string): Clip | undefined {
  return project.clips.find(c => c.id === id);
}
function findMedia(project: Project, id: string): MediaItem | undefined {
  return project.media.find(m => m.id === id);
}

function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur - EPS && bStart < aStart + aDur - EPS;
}

function hasOverlap(project: Project, trackId: string, start: number, duration: number, excludeId?: string): boolean {
  return project.clips.some(c => c.trackId === trackId && c.id !== excludeId && overlaps(start, duration, c.start, c.duration));
}

/** Duration/inPoint/overlap invariants a clip must satisfy to exist on the timeline. */
function clipBoundsValid(project: Project, clip: Clip, excludeId?: string): boolean {
  if (clip.duration <= EPS) return false;
  if (clip.start < -EPS) return false;
  if (clip.inPoint < -EPS) return false;
  const media = clip.mediaId ? findMedia(project, clip.mediaId) : undefined;
  const unlimitedSource = !media || media.kind === 'image';
  if (!unlimitedSource && media && clip.inPoint + clip.duration * clip.speed > media.duration + EPS) return false;
  if (hasOverlap(project, clip.trackId, clip.start, clip.duration, excludeId ?? clip.id)) return false;
  return true;
}

function normalize(project: Project): Project {
  return {
    ...project,
    clips: [...project.clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    transitions: [...project.transitions].sort((a, b) => a.id.localeCompare(b.id)),
    markers: [...project.markers].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)),
  };
}

function noop(project: Project): { project: Project; inverse: EditAction } {
  return { project, inverse: { type: 'batch', actions: [], label: 'noop' } };
}

function batchOf(actions: EditAction[], label: string): EditAction {
  return { type: 'batch', actions, label };
}

export function applyEdit(project: Project, action: EditAction): { project: Project; inverse: EditAction } {
  switch (action.type) {
    case 'addMedia': {
      const media = action.media;
      if (findMedia(project, media.id)) return noop(project);
      const next = normalize({ ...project, media: [...project.media, media] });
      return { project: next, inverse: { type: 'removeMedia', mediaId: media.id } };
    }

    case 'removeMedia': {
      // Media has no order/index field in the contract, so exact-position
      // restore can't be a single addMedia. Instead we snapshot the whole
      // tail starting at the removed item (itself + everyone after it,
      // whose data is untouched but whose array index would otherwise
      // shift), and the inverse clears + re-appends that tail in order.
      const idx = project.media.findIndex(m => m.id === action.mediaId);
      if (idx === -1) return noop(project);
      const removed = project.media[idx];
      const suffix = project.media.slice(idx);

      const cascadeFor = (m: MediaItem): { clips: Clip[]; transitions: Transition[] } => {
        const clips = project.clips.filter(c => c.mediaId === m.id);
        const ids = new Set(clips.map(c => c.id));
        const transitions = project.transitions.filter(t => ids.has(t.fromClipId) || ids.has(t.toClipId));
        return { clips, transitions };
      };

      // Cascade removal ignores track lock (a clip losing its media isn't a
      // clip *edit*), but addClip refuses locked tracks — so any cascaded
      // clip on a locked track needs the same unlock/re-lock sandwich as
      // removeTrack, or its restore would silently no-op.
      const restoreSteps: EditAction[] = [];
      const lockedTracks = new Set<string>();
      for (const m of suffix) {
        const { clips, transitions } = cascadeFor(m);
        restoreSteps.push({ type: 'addMedia', media: m });
        for (const c of clips) {
          if (findTrack(project, c.trackId)?.locked) lockedTracks.add(c.trackId);
          restoreSteps.push({ type: 'addClip', clip: c });
        }
        for (const t of transitions) restoreSteps.push({ type: 'addTransition', transition: t });
      }
      const unlockSteps: EditAction[] = [...lockedTracks].map(id => ({ type: 'updateTrack', trackId: id, patch: { locked: false } }));
      const relockSteps: EditAction[] = [...lockedTracks].map(id => ({ type: 'updateTrack', trackId: id, patch: { locked: true } }));

      const { clips: ownClips, transitions: ownTransitions } = cascadeFor(removed);
      const ownClipIds = new Set(ownClips.map(c => c.id));
      const ownTransitionIds = new Set(ownTransitions.map(t => t.id));
      const next = normalize({
        ...project,
        media: project.media.filter(m => m.id !== removed.id),
        clips: project.clips.filter(c => !ownClipIds.has(c.id)),
        transitions: project.transitions.filter(t => !ownTransitionIds.has(t.id)),
      });

      const inverse = batchOf(
        [
          ...suffix.map((m): EditAction => ({ type: 'removeMedia', mediaId: m.id })),
          ...unlockSteps,
          ...restoreSteps,
          ...relockSteps,
        ],
        'undo removeMedia',
      );
      return { project: next, inverse };
    }

    case 'addTrack': {
      const track = action.track;
      if (findTrack(project, track.id)) return noop(project);
      const tracks = [...project.tracks];
      const idx = action.index === undefined ? tracks.length : Math.max(0, Math.min(action.index, tracks.length));
      tracks.splice(idx, 0, track);
      const next = normalize({ ...project, tracks });
      return { project: next, inverse: { type: 'removeTrack', trackId: track.id } };
    }

    case 'removeTrack': {
      // A track's lock protects its clips from edits, not the track's own
      // existence, so removeTrack ignores `locked`. The inverse sandwiches
      // the restore between an unlocked addTrack and updateTrack(locked) so
      // re-adding the cascaded clips isn't itself rejected by the lock guard.
      const idx = project.tracks.findIndex(t => t.id === action.trackId);
      if (idx === -1) return noop(project);
      const track = project.tracks[idx];
      const clips = project.clips.filter(c => c.trackId === track.id);
      const clipIds = new Set(clips.map(c => c.id));
      const transitions = project.transitions.filter(t => clipIds.has(t.fromClipId) || clipIds.has(t.toClipId));
      const transitionIds = new Set(transitions.map(t => t.id));

      const next = normalize({
        ...project,
        tracks: project.tracks.filter(t => t.id !== track.id),
        clips: project.clips.filter(c => c.trackId !== track.id),
        transitions: project.transitions.filter(t => !transitionIds.has(t.id)),
      });

      const inverse = batchOf(
        [
          { type: 'addTrack', track: { ...track, locked: false }, index: idx },
          ...clips.map((c): EditAction => ({ type: 'addClip', clip: c })),
          ...transitions.map((t): EditAction => ({ type: 'addTransition', transition: t })),
          { type: 'updateTrack', trackId: track.id, patch: { locked: track.locked } },
        ],
        'undo removeTrack',
      );
      return { project: next, inverse };
    }

    case 'updateTrack': {
      const track = findTrack(project, action.trackId);
      if (!track) return noop(project);
      const patch = action.patch;
      const before: Partial<Omit<Track, 'id'>> = {};
      for (const k of Object.keys(patch) as (keyof Omit<Track, 'id'>)[]) {
        (before as Record<string, unknown>)[k] = track[k];
      }
      const updated: Track = { ...track, ...patch };
      const next = normalize({ ...project, tracks: project.tracks.map(t => (t.id === track.id ? updated : t)) });
      return { project: next, inverse: { type: 'updateTrack', trackId: track.id, patch: before } };
    }

    case 'addClip': {
      const clip = action.clip;
      if (findClip(project, clip.id)) return noop(project);
      const track = findTrack(project, clip.trackId);
      if (!track || track.locked) return noop(project);
      if (!clipBoundsValid(project, clip)) return noop(project);
      const next = normalize({ ...project, clips: [...project.clips, clip] });
      return { project: next, inverse: { type: 'removeClips', clipIds: [clip.id], ripple: false } };
    }

    case 'removeClips': {
      const lockedTrackIds = new Set(project.tracks.filter(t => t.locked).map(t => t.id));
      const targets = project.clips.filter(c => action.clipIds.includes(c.id) && !lockedTrackIds.has(c.trackId));
      if (targets.length === 0) return noop(project);
      const targetIds = new Set(targets.map(c => c.id));

      const removedByTrack = new Map<string, Clip[]>();
      for (const c of targets) {
        const list = removedByTrack.get(c.trackId) ?? [];
        list.push(c);
        removedByTrack.set(c.trackId, list);
      }

      let clips = project.clips.filter(c => !targetIds.has(c.id));
      const beforeShift = new Map<string, Clip>();

      if (action.ripple) {
        clips = clips.map(c => {
          const removedOnTrack = removedByTrack.get(c.trackId);
          if (!removedOnTrack) return c;
          const shift = removedOnTrack.reduce((sum, r) => (r.start < c.start ? sum + r.duration : sum), 0);
          if (shift <= EPS) return c;
          beforeShift.set(c.id, c);
          return { ...c, start: c.start - shift };
        });
      }

      const next = normalize({
        ...project,
        clips,
        transitions: project.transitions.filter(t => !targetIds.has(t.fromClipId) && !targetIds.has(t.toClipId)),
      });

      const shiftedIds = [...beforeShift.keys()];
      // The inverse's removeClips(shiftedIds) step (to reset their position)
      // cascades away transitions touching them too, so snapshot those
      // alongside the ones touching the actually-removed targets.
      const touchedIds = new Set([...targetIds, ...shiftedIds]);
      const touchedTransitions = project.transitions.filter(t => touchedIds.has(t.fromClipId) || touchedIds.has(t.toClipId));
      const inverse = batchOf(
        [
          ...(shiftedIds.length ? [{ type: 'removeClips', clipIds: shiftedIds, ripple: false } as EditAction] : []),
          ...targets.map((c): EditAction => ({ type: 'addClip', clip: c })),
          ...shiftedIds.map((id): EditAction => ({ type: 'addClip', clip: beforeShift.get(id)! })),
          ...touchedTransitions.map((t): EditAction => ({ type: 'addTransition', transition: t })),
        ],
        'undo removeClips',
      );
      return { project: next, inverse };
    }

    case 'moveClip': {
      // Policy: moving a clip onto an already-occupied range is rejected as
      // a no-op. The UI is expected to find a free slot first (see
      // timeline/placement.ts findFreeSlot) rather than have applyEdit guess
      // where to place it.
      const clip = findClip(project, action.clipId);
      if (!clip) return noop(project);
      const srcTrack = findTrack(project, clip.trackId);
      const dstTrack = findTrack(project, action.trackId);
      if (!srcTrack || !dstTrack || srcTrack.locked || dstTrack.locked) return noop(project);
      const moved: Clip = { ...clip, start: action.start, trackId: action.trackId };
      if (!clipBoundsValid(project, moved, clip.id)) return noop(project);
      const next = normalize({ ...project, clips: project.clips.map(c => (c.id === clip.id ? moved : c)) });
      return { project: next, inverse: { type: 'moveClip', clipId: clip.id, start: clip.start, trackId: clip.trackId } };
    }

    case 'trimClip': {
      const clip = findClip(project, action.clipId);
      if (!clip) return noop(project);
      const track = findTrack(project, clip.trackId);
      if (!track || track.locked) return noop(project);

      let newStart = clip.start;
      let newDuration = clip.duration;
      let newInPoint = clip.inPoint;
      if (action.edge === 'start') {
        newStart = action.time;
        const delta = newStart - clip.start;
        newDuration = clip.duration - delta;
        newInPoint = clip.inPoint + delta * clip.speed;
      } else {
        newDuration = action.time - clip.start;
      }

      const trimmed: Clip = { ...clip, start: newStart, duration: newDuration, inPoint: newInPoint };
      const oldEnd = clip.start + clip.duration;
      const deltaDuration = newDuration - clip.duration;

      let clips = project.clips.map(c => (c.id === clip.id ? trimmed : c));
      const beforeShift = new Map<string, Clip>();

      if (action.ripple && Math.abs(deltaDuration) > EPS) {
        clips = clips.map(c => {
          if (c.id === clip.id) return c;
          if (c.trackId === clip.trackId && c.start >= oldEnd - EPS) {
            beforeShift.set(c.id, c);
            return { ...c, start: c.start + deltaDuration };
          }
          return c;
        });
      }

      const scratch: Project = { ...project, clips };
      if (!clipBoundsValid(scratch, trimmed, clip.id)) return noop(project);

      // The inverse's removeClips cascades away transitions touching the
      // clip (and any ripple-shifted clips), even though trimClip itself
      // never touches transitions — snapshot and re-add them.
      const touchedIds = new Set([clip.id, ...beforeShift.keys()]);
      const touchedTransitions = project.transitions.filter(t => touchedIds.has(t.fromClipId) || touchedIds.has(t.toClipId));

      const next = normalize(scratch);
      const inverse = batchOf(
        [
          { type: 'removeClips', clipIds: [...touchedIds], ripple: false },
          { type: 'addClip', clip },
          ...[...beforeShift.values()].map((c): EditAction => ({ type: 'addClip', clip: c })),
          ...touchedTransitions.map((t): EditAction => ({ type: 'addTransition', transition: t })),
        ],
        'undo trimClip',
      );
      return { project: next, inverse };
    }

    case 'splitClip': {
      const clip = findClip(project, action.clipId);
      if (!clip) return noop(project);
      const track = findTrack(project, clip.trackId);
      if (!track || track.locked) return noop(project);
      if (findClip(project, action.newClipId)) return noop(project);

      const splitOffset = action.time - clip.start;
      if (splitOffset <= EPS || splitOffset >= clip.duration - EPS) return noop(project);

      const leftKeyframes = clip.keyframes.filter(k => k.time < splitOffset - EPS);
      const rightKeyframes = clip.keyframes
        .filter(k => k.time >= splitOffset - EPS)
        .map(k => ({ ...k, time: k.time - splitOffset }));

      // Fades are outer-edge only: the left half keeps the original fade-in,
      // the right half keeps the original fade-out; the new cut gets none.
      const left: Clip = { ...clip, duration: splitOffset, keyframes: leftKeyframes, fadeOut: 0 };
      const right: Clip = {
        ...clip,
        id: action.newClipId,
        start: clip.start + splitOffset,
        duration: clip.duration - splitOffset,
        inPoint: clip.inPoint + splitOffset * clip.speed,
        keyframes: rightKeyframes,
        fadeIn: 0,
      };

      const transitions = project.transitions.map(t => {
        if (t.toClipId === clip.id) return { ...t, toClipId: left.id };
        if (t.fromClipId === clip.id) return { ...t, fromClipId: right.id };
        return t;
      });

      const clips = project.clips.map(c => (c.id === clip.id ? left : c)).concat(right);
      const next = normalize({ ...project, clips, transitions });

      const touchedTransitions = project.transitions.filter(t => t.toClipId === clip.id || t.fromClipId === clip.id);
      const inverse = batchOf(
        [
          // Re-point transitions back to the original clip before removing
          // the right half, so the removal doesn't cascade-delete them.
          ...touchedTransitions.map((t): EditAction => ({
            type: 'updateTransition',
            transitionId: t.id,
            patch: { fromClipId: t.fromClipId, toClipId: t.toClipId },
          })),
          { type: 'removeClips', clipIds: [right.id], ripple: false },
          {
            type: 'updateClip',
            clipId: left.id,
            patch: { duration: clip.duration, keyframes: clip.keyframes, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut },
          },
        ],
        'undo splitClip',
      );
      return { project: next, inverse };
    }

    case 'updateClip': {
      const clip = findClip(project, action.clipId);
      if (!clip) return noop(project);
      const track = findTrack(project, clip.trackId);
      if (!track || track.locked) return noop(project);
      const patch = action.patch;
      const updated: Clip = { ...clip, ...patch };
      if (!clipBoundsValid(project, updated, clip.id)) return noop(project);
      const before: Partial<Omit<Clip, 'id' | 'trackId'>> = {};
      for (const k of Object.keys(patch) as (keyof Omit<Clip, 'id' | 'trackId'>)[]) {
        (before as Record<string, unknown>)[k] = clip[k];
      }
      const next = normalize({ ...project, clips: project.clips.map(c => (c.id === clip.id ? updated : c)) });
      return { project: next, inverse: { type: 'updateClip', clipId: clip.id, patch: before } };
    }

    case 'addTransition': {
      const transition = action.transition;
      if (project.transitions.some(t => t.id === transition.id)) return noop(project);
      if (!findClip(project, transition.fromClipId) || !findClip(project, transition.toClipId)) return noop(project);
      const next = normalize({ ...project, transitions: [...project.transitions, transition] });
      return { project: next, inverse: { type: 'removeTransition', transitionId: transition.id } };
    }

    case 'removeTransition': {
      const transition = project.transitions.find(t => t.id === action.transitionId);
      if (!transition) return noop(project);
      const next = normalize({ ...project, transitions: project.transitions.filter(t => t.id !== transition.id) });
      return { project: next, inverse: { type: 'addTransition', transition } };
    }

    case 'updateTransition': {
      const transition = project.transitions.find(t => t.id === action.transitionId);
      if (!transition) return noop(project);
      const patch = action.patch;
      const updated: Transition = { ...transition, ...patch };
      const before: Partial<Omit<Transition, 'id'>> = {};
      for (const k of Object.keys(patch) as (keyof Omit<Transition, 'id'>)[]) {
        (before as Record<string, unknown>)[k] = transition[k];
      }
      const next = normalize({ ...project, transitions: project.transitions.map(t => (t.id === transition.id ? updated : t)) });
      return { project: next, inverse: { type: 'updateTransition', transitionId: transition.id, patch: before } };
    }

    case 'addMarker': {
      const marker = action.marker;
      if (project.markers.some(m => m.id === marker.id)) return noop(project);
      const next = normalize({ ...project, markers: [...project.markers, marker] });
      return { project: next, inverse: { type: 'removeMarker', markerId: marker.id } };
    }

    case 'removeMarker': {
      const marker = project.markers.find(m => m.id === action.markerId);
      if (!marker) return noop(project);
      const next = normalize({ ...project, markers: project.markers.filter(m => m.id !== marker.id) });
      return { project: next, inverse: { type: 'addMarker', marker } };
    }

    case 'updateSettings': {
      const patch = action.patch;
      if (Object.keys(patch).length === 0) return noop(project);
      const before: Partial<ProjectSettings> = {};
      for (const k of Object.keys(patch) as (keyof ProjectSettings)[]) {
        (before as Record<string, unknown>)[k] = project.settings[k];
      }
      const next = normalize({ ...project, settings: { ...project.settings, ...patch } });
      return { project: next, inverse: { type: 'updateSettings', patch: before } };
    }

    case 'batch': {
      let cur = project;
      const inverses: EditAction[] = [];
      for (const sub of action.actions) {
        const result = applyEdit(cur, sub);
        if (result.project !== cur) inverses.push(result.inverse);
        cur = result.project;
      }
      if (cur === project) return noop(project);
      return { project: cur, inverse: batchOf(inverses.reverse(), `undo ${action.label}`) };
    }

    default:
      return noop(project);
  }
}
