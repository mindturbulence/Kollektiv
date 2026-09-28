// ─── Kollektiv Video Editor — keyframe navigation ────────────────────────────
// Prev/next buttons that jump the playhead to the clip's adjacent keyframe
// (any property), disabled when there is none in that direction.
import React from 'react';
import { dispatch } from '../../core/store';
import type { Clip } from '../../core/types';
import { ChevronLeftIcon, ChevronRightIcon } from '../../../components/icons';
import { adjacentKeyframeTime } from './keyframeOps';

interface KeyframeNavProps {
  clip: Clip;
  playhead: number;
  fps: number;
}

const KeyframeNav: React.FC<KeyframeNavProps> = ({ clip, playhead }) => {
  const localTime = playhead - clip.start;
  const prevTime = adjacentKeyframeTime(clip, null, localTime, 'prev');
  const nextTime = adjacentKeyframeTime(clip, null, localTime, 'next');

  const jump = (localTarget: number | undefined) => {
    if (localTarget === undefined) return;
    dispatch({ type: 'setPlayhead', time: clip.start + localTarget });
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" aria-label="Previous keyframe" disabled={prevTime === undefined}
        className="p-0.5 text-base-content/60 hover:text-primary disabled:text-base-content/20"
        onClick={() => jump(prevTime)}>
        <ChevronLeftIcon className="w-3 h-3" />
      </button>
      <button type="button" aria-label="Next keyframe" disabled={nextTime === undefined}
        className="p-0.5 text-base-content/60 hover:text-primary disabled:text-base-content/20"
        onClick={() => jump(nextTime)}>
        <ChevronRightIcon className="w-3 h-3" />
      </button>
    </span>
  );
};

export default KeyframeNav;
