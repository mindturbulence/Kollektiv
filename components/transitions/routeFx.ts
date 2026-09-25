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
const TOOL_GROUP: ActiveTab[] = ['image_editor', 'image_compare', 'color_palette_extractor', 'resizer', 'converter', 'assets_manager', 'video_to_frames', 'lora_editor', 'batch_runner'];

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
    converter: { name: 'CONVERTER TOOL', sub: 'RENDERING TRANSMUTE MATRIX', glyph: '⚗' },
    assets_manager: { name: 'ASSETS MANAGER', sub: 'INDEXING VAULT FOLDERS', glyph: '❖' },
    video_to_frames: { name: 'FRAME EXTRACTOR', sub: 'SLICING TIMELINE', glyph: '▧' },
    lora_editor: { name: 'LORA EDITOR', sub: 'LOADING TENSOR WEIGHTS', glyph: '◈' },
    batch_runner: { name: 'BATCH RUNNER', sub: 'QUEUING OPERATIONS', glyph: '⏩' },
    image_editor: { name: 'IMAGE EDITOR', sub: 'LOADING PIXEL CANVAS', glyph: '◱' },
    comfy_studio: { name: 'COMFYUI STUDIO', sub: 'INITIALIZING PIPELINE', glyph: '◈' },
    a1111_studio: { name: 'FORGE STUDIO', sub: 'CALIBRATING NEURAL CORE', glyph: '◈' },
};

export interface FxMeta {
    geometry: FxGeometry;
    /** ms the overlay stays fully closed while React swaps behind it */
    hold: number;
}

export const FX_META: Record<Exclude<FxKind, 'context-switch'>, FxMeta> = {
    'module-boot': { geometry: 'shutterV', hold: 80 },
    'shell-return': { geometry: 'iris', hold: 80 },
    'vault-decompress': { geometry: 'shutterH', hold: 80 },
    'system-access': { geometry: 'doors', hold: 80 },
    'uplink': { geometry: 'irisTop', hold: 80 },
    'tool-mount': { geometry: 'shards', hold: 80 },
};

/* M1 route-transition retiming (review #1 / motion.md §2):
   every geometry now targets cover 220 ms + hold 80 ms + reveal 320 ms —
   about 650 ms total instead of the measured 1.5–1.77 s. The HUD dressing
   (scramble, hex ticker) rides the new tail; it just reads faster. */
export const FX_TIMING = {
    coverDuration: 0.22,   // s — geometry close
    coverStagger: 0.012,   // s — strip stagger
    revealDuration: 0.32,  // s — geometry open
    revealStagger: 0.015,  // s
    sweepDuration: 0.4,    // s — light sweep
    scrambleMs: 80,        // ms — HUD name scramble (was 520)
} as const;

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

/** M1: the full cinematic plays only on the FIRST visit to each module per
 *  session; repeat visits get a 150 ms opacity crossfade (--duration-quick,
 *  --ease-smooth-out). Returned Promise resolves after the fade — the caller
 *  commits the tab at that point (content behind is invisible mid-fade). */
export function crossfade(el: HTMLElement | null, ms = 150): Promise<void> {
    if (!el || typeof window === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
        el.style.transition = `opacity ${ms}ms var(--ease-smooth-out, ease-out)`;
        el.style.opacity = '0';
        window.setTimeout(() => {
            el.style.opacity = '1';
            el.style.transition = '';
            resolve();
        }, ms);
    });
}
