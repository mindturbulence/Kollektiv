// ─── Kollektiv Video Editor — keyframe toggle ────────────────────────────────
// Small diamond next to a keyframeable Inspector slider: filled when a
// keyframe exists at the playhead, hollow otherwise. Click adds/removes one;
// right-click opens an easing menu for the keyframe at the playhead.
import React, { useState } from 'react';
import { dispatch } from '../../core/store';
import type { Clip, EasingType, Keyframe } from '../../core/types';
import { keyframeAt, removeKeyframe, setKeyframe, setKeyframeEasing } from './keyframeOps';

const EASINGS: EasingType[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];

interface KeyframeButtonProps {
  clip: Clip;
  property: Keyframe['property'];
  playhead: number;
  fps: number;
  value: number;
}

const KeyframeButton: React.FC<KeyframeButtonProps> = ({ clip, property, playhead, fps, value }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const localTime = playhead - clip.start;
  const outside = localTime < 0 || localTime > clip.duration;
  const existing = outside ? undefined : keyframeAt(clip, property, localTime, fps);
  const active = !!existing;

  const toggle = () => {
    if (outside) return;
    // `value` is the currently displayed value (base or keyframe-interpolated),
    // supplied by the caller — freeze that into a new keyframe at the playhead.
    const keyframes = active
      ? removeKeyframe(clip, property, localTime, fps)
      : setKeyframe(clip, property, localTime, value, fps);
    dispatch({ type: 'updateClip', clipId: clip.id, patch: { keyframes } });
  };

  const chooseEasing = (easing: EasingType) => {
    if (!active) return;
    dispatch({ type: 'updateClip', clipId: clip.id, patch: { keyframes: setKeyframeEasing(clip, property, localTime, fps, easing) } });
    setMenuOpen(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={outside}
        aria-label={active ? `Remove ${property} keyframe` : `Add ${property} keyframe`}
        aria-pressed={active}
        className={`w-3 h-3 rotate-45 border flex-shrink-0 ${
          outside ? 'border-base-content/15 opacity-40' : active ? 'bg-primary border-primary' : 'border-base-content/40 hover:border-primary'
        }`}
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          if (active) setMenuOpen(v => !v);
        }}
      />
      {menuOpen && active && (
        <ul className="absolute z-10 top-4 left-0 bg-base-100 border border-base-content/10 text-2xs font-mono shadow-lg" role="menu" aria-label={`${property} keyframe easing`}>
          {EASINGS.map(easing => (
            <li key={easing}>
              <button type="button" role="menuitem" className={`block w-full text-left px-2 py-1 hover:bg-primary/10 ${existing?.easing === easing ? 'text-primary' : 'text-base-content/70'}`}
                onClick={() => chooseEasing(easing)}>
                {easing}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};

export default KeyframeButton;
