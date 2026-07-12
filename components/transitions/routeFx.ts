import type { ActiveTab } from '../../types';

/**
 * Context Shift Engine — route-pair semantics.
 * Which signature transition plays when navigating from one module to another.
 */
export type FxKind =
    | 'module-boot'      // dashboard -> workspace tools: full theatrical shutter boot
    | 'context-switch'   // between workspace siblings: internal swap, no overlay
    | 'shell-return'     // any -> dashboard: iris back to the OS shell
    | 'vault-decompress' // any -> gallery/library: archive scan-slam
    | 'system-access'    // any -> settings: blast doors
    | 'uplink'           // any -> assistant: radar iris from top
    | 'tool-mount';      // any -> utility tools: diagonal shards

export type FxGeometry = 'shutterV' | 'shutterH' | 'doors' | 'iris' | 'irisTop' | 'shards';

/** Tabs that share the single mounted PromptsPage (AnimatePresence key 'prompts_group'). */
const WORKSPACE_GROUP: ActiveTab[] = ['prompts', 'crafter', 'refiner', 'prompt_analyzer', 'media_analyzer'];
const ARCHIVE_GROUP: ActiveTab[] = ['gallery', 'prompt'];
const TOOL_GROUP: ActiveTab[] = ['image_compare', 'color_palette_extractor', 'resizer', 'video_to_frames', 'lora_editor'];

export const ROUTE_LABELS: Record<ActiveTab, { name: string; sub: string; glyph: string }> = {
    dashboard: { name: 'SHELL', sub: 'RETURNING TO CORE', glyph: '◈' },
    assistant: { name: 'KOLLEKTIV UPLINK', sub: 'ESTABLISHING CHANNEL', glyph: '◎' },
    discovery: { name: 'DISCOVERY MODULE', sub: 'SCANNING VAULT DATABASE', glyph: '⌖' },
    prompts: { name: 'BUILDER MODULE', sub: 'LOADING WORKSPACE', glyph: '▤' },
    crafter: { name: 'CRAFTER MODULE', sub: 'MOUNTING CONSTRUCTOR', glyph: '⬒' },
    refiner: { name: 'REFINER MODULE', sub: 'CALIBRATING NEURAL ENGINE', glyph: '◬' },
    prompt_analyzer: { name: 'ANALYZER MODULE', sub: 'PARSING TOKEN STREAM', glyph: '≣' },
    media_analyzer: { name: 'MEDIA ANALYZER', sub: 'DECODING FRAME BUFFER', glyph: '▦' },
    prompt: { name: 'LIBRARY ARCHIVE', sub: 'DECRYPTING RECORDS', glyph: '❒' },
    gallery: { name: 'VAULT ARCHIVE', sub: 'DECOMPRESSING ASSETS', glyph: '⬚' },
    settings: { name: 'ROOT ACCESS', sub: 'PRIVILEGE ESCALATION GRANTED', glyph: '⛨' },
    composer: { name: 'COMPOSER MODULE', sub: 'ASSEMBLING GRID MATRIX', glyph: '▥' },
    image_compare: { name: 'COMPARE TOOL', sub: 'MOUNTING DUAL BUFFER', glyph: '◫' },
    color_palette_extractor: { name: 'PALETTE TOOL', sub: 'SAMPLING SPECTRUM', glyph: '◧' },
    resizer: { name: 'RESIZER TOOL', sub: 'ALLOCATING CANVAS', glyph: '⿴' },
    video_to_frames: { name: 'FRAME EXTRACTOR', sub: 'SLICING TIMELINE', glyph: '▧' },
    lora_editor: { name: 'LORA EDITOR', sub: 'LOADING TENSOR WEIGHTS', glyph: '◈' },
};

export interface FxMeta {
    geometry: FxGeometry;
    /** ms the overlay stays fully closed while React swaps behind it */
    hold: number;
}

export const FX_META: Record<Exclude<FxKind, 'context-switch'>, FxMeta> = {
    'module-boot': { geometry: 'shutterV', hold: 400 },
    'shell-return': { geometry: 'iris', hold: 180 },
    'vault-decompress': { geometry: 'shutterH', hold: 320 },
    'system-access': { geometry: 'doors', hold: 380 },
    'uplink': { geometry: 'irisTop', hold: 260 },
    'tool-mount': { geometry: 'shards', hold: 220 },
};

export const resolveFx = (from: ActiveTab, to: ActiveTab): FxKind => {
    if (WORKSPACE_GROUP.includes(from) && WORKSPACE_GROUP.includes(to)) return 'context-switch';
    if (to === 'dashboard') return 'shell-return';
    if (to === 'assistant') return 'uplink';
    if (to === 'settings') return 'system-access';
    if (ARCHIVE_GROUP.includes(to)) return 'vault-decompress';
    if (TOOL_GROUP.includes(to)) return 'tool-mount';
    return 'module-boot';
};

export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
