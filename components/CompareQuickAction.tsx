import React from 'react';
import { audioService } from '../services/audioService';
import { appEventBus } from '../utils/eventBus';

interface CompareQuickActionProps {
  /** Data URL or blob URL of the current generation result. */
  currentUrl: string;
  /** The prompt that generated the current result. */
  currentPrompt: string;
  /** Optional data URL of the previous generation to compare against. */
  previousUrl?: string;
  /** Optional prompt of the previous generation. */
  previousPrompt?: string;
}

/**
 * A one-click button that opens the image compare page with the current and
 * previous generation results loaded side-by-side.
 */
const CompareQuickAction: React.FC<CompareQuickActionProps> = ({
  currentUrl,
  currentPrompt,
  previousUrl,
  previousPrompt,
}) => {
  const handleCompare = () => {
    audioService.playClick();
    // Emit an event to navigate to the image compare page with data
    appEventBus.emit('navigate', 'image_compare');
    // Dispatch a custom event carrying the two URLs so ImageCompare can pick them up
    const detail = {
      imageA: previousUrl || currentUrl,
      imageB: currentUrl,
      labelA: previousPrompt ? `Previous: ${previousPrompt.slice(0, 60)}...` : 'Previous',
      labelB: `Current: ${currentPrompt.slice(0, 60)}...`,
    };
    window.dispatchEvent(new CustomEvent('compare-images', { detail }));
  };

  return (
    <button
      onClick={handleCompare}
      onMouseEnter={() => audioService.playHover()}
      className="btn btn-sm btn-ghost flex-1 rounded-none tracking-wider uppercase font-mono text-[10px] border border-accent/30 text-accent/80 hover:text-accent hover:border-accent/60 btn-snake"
    >
      <span /><span /><span /><span />
      COMPARE
    </button>
  );
};

export default CompareQuickAction;
