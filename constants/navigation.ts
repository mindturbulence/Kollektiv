import type { ActiveTab } from '../types';

export interface NavItemData {
  id: ActiveTab;
  label: string;
  enabled?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItemData[];
  /** Set for groups that are a single page rather than a dropdown. */
  singleId?: ActiveTab;
}

/** The header's navigation, shared with Home's "recently used tools" row. */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', items: [], singleId: 'dashboard' },
  { id: 'discovery', label: 'Discovery', items: [], singleId: 'discovery' },
  {
    id: 'workspaces', label: 'Workbench', items: [
      { id: 'crafter', label: 'Crafter' },
      { id: 'refiner', label: 'Refiner' },
      { id: 'prompt_analyzer', label: 'Analyzer' },
      { id: 'media_analyzer', label: 'Abstractor' },
      { id: 'batch_runner', label: 'Batch' },
    ],
  },
  {
    id: 'vault', label: 'Vault', items: [
      { id: 'prompt', label: 'Prompt' },
      { id: 'gallery', label: 'Media' },
    ],
  },
  {
    id: 'utilities', label: 'Utilities', items: [
      { id: 'assets_manager', label: 'Assets' },
      { id: 'color_palette_extractor', label: 'Palette' },
      { id: 'resizer', label: 'Resizer' },
      { id: 'converter', label: 'Converter' },
      { id: 'video_to_frames', label: 'Video' },
    ],
  },
  {
    id: 'studio', label: 'Studio', items: [
      { id: 'image_editor', label: 'Image Editor' },
      { id: 'video_editor', label: 'Video Editor' },
      { id: 'composer', label: 'Composer' },
      { id: 'image_compare', label: 'Compare' },
      { id: 'lora_editor', label: 'LoRA Editor' },
      { id: 'comfy_studio', label: 'ComfyUI' },
      { id: 'a1111_studio', label: 'A1111' },
    ],
  },
];

/** `prompts` renders the Crafter composer, so it counts as Crafter in the nav. */
export const toNavTab = (tab: ActiveTab): ActiveTab => (tab === 'prompts' ? 'crafter' : tab);
