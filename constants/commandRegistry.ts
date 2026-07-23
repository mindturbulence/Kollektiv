import { appEventBus } from '../utils/eventBus';
import type { ActiveTab } from '../types';

export interface CommandItem {
  id: string;
  label: string;
  category: 'Navigation' | 'Panels' | 'Assistant Actions' | 'Themes' | 'Settings' | 'Tools';
  keywords: string[];
  shortcut?: string;
  icon?: string;
  execute: () => void;
}

const NAVIGATION_COMMANDS: CommandItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', category: 'Navigation', keywords: ['home', 'landing'], shortcut: '⌘1', execute: () => appEventBus.emit('navigate', 'dashboard' as ActiveTab) },
  { id: 'nav-assistant', label: 'Assistant', category: 'Navigation', keywords: ['ai', 'chat', 'voice', 'live'], shortcut: '⌘2', execute: () => appEventBus.emit('navigate', 'assistant' as ActiveTab) },
  { id: 'nav-discovery', label: 'Discovery', category: 'Navigation', keywords: ['explore', 'prompts', 'community'], execute: () => appEventBus.emit('navigate', 'discovery' as ActiveTab) },
  { id: 'nav-crafter', label: 'Crafter', category: 'Navigation', keywords: ['compose', 'wildcard', 'builder'], execute: () => appEventBus.emit('navigate', 'crafter' as ActiveTab) },
  { id: 'nav-refiner', label: 'Refiner', category: 'Navigation', keywords: ['enhance', 'improve', 'polish'], execute: () => appEventBus.emit('navigate', 'refiner' as ActiveTab) },
  { id: 'nav-analyzer', label: 'Prompt Analyzer', category: 'Navigation', keywords: ['dissect', 'breakdown', 'anatomy'], execute: () => appEventBus.emit('navigate', 'prompt_analyzer' as ActiveTab) },
  { id: 'nav-abstractor', label: 'Media Abstractor', category: 'Navigation', keywords: ['analyze', 'image', 'vision', 'abstract'], execute: () => appEventBus.emit('navigate', 'media_analyzer' as ActiveTab) },
  { id: 'nav-gallery', label: 'Gallery (Vault)', category: 'Navigation', keywords: ['media', 'images', 'videos', 'archive'], shortcut: '⌘3', execute: () => appEventBus.emit('navigate', 'gallery' as ActiveTab) },
  { id: 'nav-library', label: 'Prompt Library', category: 'Navigation', keywords: ['saved', 'prompts', 'templates'], shortcut: '⌘4', execute: () => appEventBus.emit('navigate', 'prompt' as ActiveTab) },
  { id: 'nav-composer', label: 'Grid Composer', category: 'Navigation', keywords: ['contact', 'sheet', 'grid', 'matte'], execute: () => appEventBus.emit('navigate', 'composer' as ActiveTab) },
  { id: 'nav-compare', label: 'Image Compare', category: 'Navigation', keywords: ['diff', 'side', 'viewer'], execute: () => appEventBus.emit('navigate', 'image_compare' as ActiveTab) },
  { id: 'nav-palette', label: 'Color Palette', category: 'Navigation', keywords: ['color', 'mood', 'extract'], execute: () => appEventBus.emit('navigate', 'color_palette_extractor' as ActiveTab) },
  { id: 'nav-resizer', label: 'Image Resizer', category: 'Navigation', keywords: ['scale', 'topaz', 'upscale'], execute: () => appEventBus.emit('navigate', 'resizer' as ActiveTab) },
  { id: 'nav-video', label: 'Video to Frames', category: 'Navigation', keywords: ['ffmpeg', 'extract', 'frame'], execute: () => appEventBus.emit('navigate', 'video_to_frames' as ActiveTab) },
  { id: 'nav-lora', label: 'LoRA Editor', category: 'Navigation', keywords: ['metadata', 'tags', 'model'], execute: () => appEventBus.emit('navigate', 'lora_editor' as ActiveTab) },
  { id: 'nav-settings', label: 'Settings', category: 'Navigation', keywords: ['preferences', 'config', 'setup'], shortcut: '⌘,', execute: () => appEventBus.emit('navigate', 'settings' as ActiveTab) },
];

const PANEL_COMMANDS: CommandItem[] = [
  { id: 'panel-media', label: 'Toggle Media Panel', category: 'Panels', keywords: ['music', 'youtube', 'spotify', 'player'], execute: () => appEventBus.emit('togglePanel', 'media') },
  { id: 'panel-clipping', label: 'Toggle Clipping Panel', category: 'Panels', keywords: ['clipboard', 'ideas', 'buffer', 'notes'], execute: () => appEventBus.emit('togglePanel', 'clipping') },
  { id: 'panel-webviewer', label: 'Toggle Web Viewer', category: 'Panels', keywords: ['browser', 'web', 'page', 'url'], execute: () => appEventBus.emit('togglePanel', 'webviewer') },
  { id: 'panel-chat', label: 'Toggle Chat Panel', category: 'Panels', keywords: ['llm', 'conversation', 'text', 'talk'], execute: () => appEventBus.emit('togglePanel', 'chat') },
  { id: 'panel-activity', label: 'Toggle Activity Panel', category: 'Panels', keywords: ['transcript', 'tools', 'log', 'history'], execute: () => appEventBus.emit('togglePanel', 'activity') },
  { id: 'panel-llm', label: 'Toggle LLM Status', category: 'Panels', keywords: ['engine', 'provider', 'status', 'model'], execute: () => appEventBus.emit('togglePanel', 'llm') },
];

const ASSISTANT_COMMANDS: CommandItem[] = [
  { id: 'action-refine', label: 'Open Refiner', category: 'Assistant Actions', keywords: ['enhance', 'improve', 'polish prompt'], execute: () => appEventBus.emit('navigate', 'refiner' as ActiveTab) },
  { id: 'action-crafter', label: 'Open Crafter', category: 'Assistant Actions', keywords: ['compose', 'wildcard', 'build prompt'], execute: () => appEventBus.emit('navigate', 'crafter' as ActiveTab) },
  { id: 'action-search-gallery', label: 'Open Gallery', category: 'Assistant Actions', keywords: ['find', 'media', 'image', 'browse'], execute: () => appEventBus.emit('navigate', 'gallery' as ActiveTab) },
  { id: 'action-new-note', label: 'New Note', category: 'Assistant Actions', keywords: ['create note', 'write', 'memo', 'clip'], execute: () => appEventBus.emit('togglePanel', 'clipping') },
];

const THEME_COMMANDS: CommandItem[] = [
  { id: 'theme-next', label: 'Next Theme', category: 'Themes', keywords: ['switch theme', 'cycle', 'change look'], execute: () => appEventBus.emit('cycleTheme', {}) },
];

export const ALL_COMMANDS: CommandItem[] = [
  ...NAVIGATION_COMMANDS,
  ...PANEL_COMMANDS,
  ...ASSISTANT_COMMANDS,
  ...THEME_COMMANDS,
];

/** Simple fuzzy match scorer. Returns a score 0-1 where higher = better match. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q || !t) return 0;
  if (t.startsWith(q)) return 1.0;
  if (t.includes(q)) return 0.8;

  // Character-by-character subsequence match
  let qi = 0;
  let consecutive = 0;
  let bestStreak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      bestStreak = Math.max(bestStreak, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return 0; // Not all chars matched

  return 0.3 + (bestStreak / q.length) * 0.5;
}

/** Filter and score commands against a query. Returns sorted results. */
export function searchCommands(query: string, commands: CommandItem[] = ALL_COMMANDS): CommandItem[] {
  if (!query.trim()) return commands;

  const scored = commands.map(cmd => {
    const labelScore = fuzzyScore(query, cmd.label);
    const keywordScores = cmd.keywords.map(k => fuzzyScore(query, k));
    const bestKeyword = Math.max(...keywordScores, 0);
    const score = Math.max(labelScore * 1.2, bestKeyword); // Boost primary label matches
    return { cmd, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.cmd);
}
