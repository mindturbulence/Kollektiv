# LoRA Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `LoRA-Edit/` (standalone vanilla-JS safetensors metadata viewer/editor) into a new "LoRA Editor" page under Kollektiv's Utilities menu, with full feature parity and native app styling.

**Architecture:** A new `components/loraEditor/` folder (mirrors the existing `components/settings/` split): pure-function `lib/` modules ported from `LoRA-Edit/main.js` (safetensors parsing, hashing, custom-field eval, templating, tag tools, online lookup), each with a vitest unit test; then presentational panel components that consume them; a top-level `LoraEditorPage.tsx` that owns state and orchestrates the parse → hash → lookup → custom-fields pipeline, following `ImageResizer.tsx`'s aside+main frame layout.

**Tech Stack:** React 19 + TypeScript, `motion/react`, existing `form-input`/`form-select`/`form-btn` CSS classes and `AnimatedPanels.tsx` primitives, `react-syntax-highlighter` (already a dependency) for JSON display, `hash-wasm` (new dependency) for >2GB chunked hashing, vitest for tests.

## Global Constraints

- Full feature parity with `LoRA-Edit/main.js`, including CivitAI/Arc en Ciel online lookup and the `eval()`-based custom-fields system (user-approved, self-XSS trust model — see spec).
- No styling ported from the original tool; use the app's native `form-*` classes, `corner-frame`/`PanelLine`/`ScanLine`, and `components/settings/primitives.tsx`.
- One page, internal tabs — single `lora_editor` entry under Utilities, not multiple menu items.
- Custom-field `eval()` is implemented via `new Function(...)` with explicit named parameters (not `window` globals like the original) — same capability, no global pollution.
- Settings persist via the existing `useLocalStorage` hook under one key; no new storage service.
- Reference spec: `docs/superpowers/specs/2026-07-10-lora-editor-design.md`.

---

## Task 1: Wire up navigation to a minimal LoRA Editor page

**Files:**
- Modify: `types.ts:3-19` (add `'lora_editor'` to `ActiveTab`)
- Modify: `components/Header.tsx:139-145` (add nav entry to `utilityItems`)
- Modify: `components/App.tsx` (import + `renderContent()` case + `currentTitle` case)
- Create: `components/loraEditor/LoraEditorPage.tsx`

**Interfaces:**
- Produces: `LoraEditorPage` component with signature `React.FC<{ isExiting?: boolean }>` — later tasks will expand its internals but this signature is stable for `App.tsx`'s `renderContent()`.

This task exists so the page is reachable and visually verifiable before any parsing logic is built — it directly closes the "I can't see the link" gap.

- [ ] **Step 1: Add the ActiveTab entry**

In `types.ts`, add `'lora_editor'` to the `ActiveTab` union (after `'composer'`, before `'settings'`):

```ts
export type ActiveTab =
  | 'dashboard'
  | 'discovery'
  | 'prompts'
  | 'crafter'
  | 'refiner'
  | 'prompt_analyzer'
  | 'media_analyzer'
  | 'prompt'
  | 'gallery'

  | 'resizer'
  | 'video_to_frames'
  | 'image_compare'
  | 'color_palette_extractor'
  | 'composer'
  | 'lora_editor'
  | 'settings';
```

- [ ] **Step 2: Add the nav entry**

In `components/Header.tsx`, add to `utilityItems` (around line 139-145):

```tsx
  const utilityItems: NavItemData[] = [
    { id: 'composer' as ActiveTab, label: 'Composer' },
    { id: 'image_compare' as ActiveTab, label: 'Compare' },
    { id: 'color_palette_extractor' as ActiveTab, label: 'Palette' },
    { id: 'resizer' as ActiveTab, label: 'Resizer' },
    { id: 'video_to_frames' as ActiveTab, label: 'Video' },
    { id: 'lora_editor' as ActiveTab, label: 'LoRA Editor' },
  ];
```

- [ ] **Step 3: Create the minimal page component**

Create `components/loraEditor/LoraEditorPage.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, panelVariants, sectionWipeVariants, TerminalText } from '../AnimatedPanels';
import { UploadIcon } from '../icons';

interface LoraEditorPageProps {
    isExiting?: boolean;
}

const LoraEditorPage: React.FC<LoraEditorPageProps> = ({ isExiting = false }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = useCallback((files: FileList | File[]) => {
        const list = Array.from(files);
        const match = list.find(f => f.name.endsWith('.safetensors') || f.name.endsWith('.gguf'));
        if (match) setFile(match);
    }, []);

    return (
        <div className="flex flex-col h-full w-full relative overflow-visible p-0 bg-transparent">
            <motion.div
                variants={panelVariants}
                initial="hidden"
                animate={isExiting ? 'exit' : 'visible'}
                exit="exit"
                className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-6 bg-base-100/10 backdrop-blur-md">
                        <TerminalText text="LORA EDITOR" delay={2.0} className="text-[10px] font-black uppercase text-primary" />
                    </motion.header>
                    <div className="flex-grow p-6 bg-transparent relative flex flex-col overflow-hidden">
                        {!file ? (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                                onDragEnter={() => setIsDragging(true)}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                            >
                                <label className={`w-full h-full rounded-none flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'bg-primary/10' : 'hover:bg-base-200/20'}`}>
                                    <input type="file" accept=".safetensors,.gguf" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                                    <UploadIcon className="w-16 h-16 text-base-content/20 mb-6" />
                                    <h2 className="text-2xl font-black uppercase tracking-tighter">DROP LORA FILE</h2>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-base-content/40 mt-2 px-4 text-center">.safetensors or .gguf — drop or click to select</p>
                                </label>
                            </div>
                        ) : (
                            <div className="text-xs font-mono text-base-content/60">{file.name} loaded ({(file.size / 1e6).toFixed(1)} MB)</div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoraEditorPage;
```

- [ ] **Step 4: Wire it into App.tsx**

In `components/App.tsx`, add the import near the other page imports (around line 39):

```tsx
import { LoraEditorPage } from './loraEditor/LoraEditorPage';
```

Note: the component above uses `export default`, so import it as:

```tsx
import LoraEditorPage from './loraEditor/LoraEditorPage';
```

Add a case to `renderContent()`'s switch (around line 837, near `'video_to_frames'`):

```tsx
            case 'lora_editor': return <LoraEditorPage key="lora_editor" isExiting={false} />;
```

Add a case to the `currentTitle` `useMemo` switch (around line 453, near `'video_to_frames'`):

```tsx
            case 'lora_editor': return `LORA | ${base}`;
```

- [ ] **Step 5: Manual verification**

Run the dev server and confirm the page is reachable:

```bash
pnpm run dev
```

Open the app, open the Utilities menu in the header, click "LoRA Editor", confirm the drop-zone page renders and dropping/selecting a `.safetensors` file shows its name and size.

- [ ] **Step 6: Commit**

```bash
git add types.ts components/Header.tsx components/App.tsx components/loraEditor/LoraEditorPage.tsx
git commit -m "feat: add LoRA Editor utility page (navigation + drop zone)"
```

---

## Task 2: Shared types and ported defaults

**Files:**
- Create: `components/loraEditor/types.ts`
- Create: `components/loraEditor/constants.ts`

**Interfaces:**
- Produces: `CustomFieldDef`, `FilterMethod`, `LookupSource`, `LoraEditorSettings`, `CustomFieldContext`, `FileHashes` types; `DEFAULT_CUSTOM_FIELDS`, `DEFAULT_SETTINGS`, `DEFAULT_CUSTOM_TEMPLATE` constants — every later task in this plan imports from here.

- [ ] **Step 1: Write types.ts**

Create `components/loraEditor/types.ts`:

```ts
export interface CustomFieldDef {
    label: string;
    calc: string;
    showError?: boolean;
}

export type FilterMethod = 'none' | 'partial' | 'exact' | 'regex';
export type LookupSource = '' | 'civ' | 'aec';

export interface LoraEditorSettings {
    summaryFields: string;
    editorFields: string;
    showUndefinedSummaryValues: boolean;
    summaryLayout: 'json' | 'table' | 'custom';
    customFields: CustomFieldDef[];
    customTemplate: string;

    primaryLookup: LookupSource;
    secondaryLookup: LookupSource;
    enableProxy: boolean;
    proxyUrl: string;

    tagFrequencyCount: number;
    tagFrequencyFilter: string;
    tagFrequencyFilterMethod: FilterMethod;
    tagExcludeFilter: string;
    tagExcludeFilterMethod: FilterMethod;
    tagByFolder: boolean;

    suggestedPromptCount: number;
    suggestedPromptFilter: string;
    suggestedPromptFilterMethod: FilterMethod;
    suggestedPromptExcludeFilter: string;
    suggestedPromptExcludeFilterMethod: FilterMethod;
    suggestedPromptByFolder: boolean;
}

export interface FileHashes {
    sha256?: string;
    autov2?: string;
    sha256_autov3?: string;
    autov3?: string;
}

export interface CustomFieldContext {
    fileMetadata: Record<string, any>;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    basemodelMetadata: Record<string, any>;
    vaeMetadata: Record<string, any>;
    safetensorsFile: File | null;
}

export interface LookupResult {
    data: any;
    hash: string;
    modelUrl: string;
    resourceUrl: string;
    source: 'CivitAI' | 'Arc En Ciel';
}
```

- [ ] **Step 2: Write constants.ts (defaults ported verbatim from LoRA-Edit's DEFAULTS)**

Create `components/loraEditor/constants.ts`:

```ts
import type { CustomFieldDef, LoraEditorSettings } from './types';

export const DEFAULT_SUMMARY_FIELDS =
    'ss_output_name,ss_sd_model_name,ss_network_module,custom.batch_size,ss_gradient_accumulation_steps,custom.resolution,ss_optimizer,ss_lr_scheduler,ss_network_module,ss_clip_skip,ss_network_dim,ss_network_alpha,ss_network_args,ss_epoch,ss_num_epochs,ss_steps,ss_max_train_steps,ss_learning_rate,ss_text_encoder_lr,ss_unet_lr,ss_noise_offset,ss_adaptive_noise_scale,ss_min_snr_gamma,sshs_model_hash,custom.training_time,custom.training_start_time,custom.training_end_time,custom.lora_hash,custom.lora_hash_type,custom.civitai_url,ss_dataset_dirs,civitai.trainedWords';

export const DEFAULT_EDITOR_FIELDS = 'ss_output_name,ss_training_comment';

export const DEFAULT_CUSTOM_FIELDS: CustomFieldDef[] = [
    { label: 'training_start_time', calc: 'new Date(fileMetadata.ss_training_started_at * 1000)' },
    { label: 'training_end_time', calc: 'new Date(fileMetadata.ss_training_finished_at * 1000)' },
    { label: 'training_time_ms', calc: 'Math.abs(customMetadata.training_end_time.getTime() - customMetadata.training_start_time.getTime())' },
    { label: 'training_h', calc: 'Math.floor(customMetadata.training_time_ms / (1000 * 60 * 60))' },
    { label: 'training_m', calc: 'Math.floor((customMetadata.training_time_ms % (1000 * 60 * 60)) / (1000 * 60))' },
    { label: 'training_s', calc: 'Math.floor((customMetadata.training_time_ms % (1000 * 60)) / 1000)' },
    { label: 'training_time', calc: 'customMetadata.training_time_ms ? `${customMetadata.training_h}h ${customMetadata.training_m}m ${customMetadata.training_s}s` : undefined' },
    { label: 'batch_size', calc: 'fileMetadata.ss_total_batch_size || (fileMetadata.ss_datasets && fileMetadata.ss_datasets[0].batch_size_per_device)' },
    { label: 'resolution', calc: "fileMetadata['modelspec.resolution'] || fileMetadata.ss_resolution || fileMetadata.ss_datasets[0].resolution.toString()" },
    { label: 'optimizer', calc: 'fileMetadata.ss_optimizer && fileMetadata.ss_optimizer.match(/\\b(\\w+)\\b(?=\\s*\\()|\\b(\\w+)\\b$/)?.[0]' },
    { label: 'base_model_hash', calc: '(fileMetadata.ss_new_sd_model_hash || fileMetadata.ss_sd_model_hash).substring(0,10)' },
    { label: 'conv_dim', calc: 'parseInt(fileMetadata.ss_network_args.conv_dim) || undefined' },
    { label: 'conv_alpha', calc: 'parseFloat(fileMetadata.ss_network_args.conv_alpha) || undefined' },
    { label: 'algo', calc: 'fileMetadata.ss_network_args.algo' },
    { label: 'optional_args', calc: "fileMetadata.ss_optimizer.indexOf('(') > 0 ? fileMetadata.ss_optimizer.slice(fileMetadata.ss_optimizer.indexOf('(')+1,-1) : undefined" },
    { label: 'optimizer_args', calc: "Object.fromEntries(customMetadata.optional_args.replace('[','(').replace(']',')').match(/(\\w+=[^,()]+|\\w+=\\([^()]*\\))/g).map(item => item.split('=')))" },
    { label: 'weight_decay', calc: 'customMetadata.optimizer_args.weight_decay' },
    { label: 'betas', calc: 'customMetadata.optimizer_args.betas' },
    { label: 'd_coef', calc: 'customMetadata.optimizer_args.d_coef' },
    { label: 'dora', calc: "fileMetadata.ss_network_args.dora_wd.toLowerCase() === 'true'" },
    { label: 'algo_dora', calc: "customMetadata.algo && customMetadata.dora ? `${customMetadata.algo} (${customMetadata.dora && 'DoRA'})` : customMetadata.algo || customMetadata.dora" },
    { label: 'training_images', calc: 'Object.values(fileMetadata.ss_dataset_dirs).reduce((sum, obj) => sum + obj.img_count, 0)' },
    { label: 'training_date', calc: "fileMetadata.ss_training_started_at ? customMetadata.training_start_time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined" },
    { label: 'gradient_accumulation', calc: "fileMetadata.ss_gradient_checkpointing === 'True' ? fileMetadata.ss_gradient_accumulation_steps : undefined" },
    { label: 'civitai_url', calc: 'civitaiMetadata?.modelId ? `https://civitai.com/models/${civitaiMetadata.modelId}?modelVersionId=${civitaiMetadata.id}` : null' },
    { label: 'civitai_link', calc: "customMetadata.civitai_url ? `<a target='_blank' href='${customMetadata.civitai_url}'>${fileMetadata.ss_output_name || safetensorsFile.name}</a>` : fileMetadata.ss_output_name || safetensorsFile.name" },
    { label: 'civitai_preview', calc: "(civitaiMetadata?.images && customMetadata.civitai_url) ? (() => { const mediaUrl = civitaiMetadata.images[0]?.url || ''; const isVideo = /\\.(mp4|webm)$/i.test(mediaUrl); const tag = isVideo ? `<video src='${mediaUrl}' style='max-width: 100%;' controls autoplay muted loop></video>` : `<img src='${mediaUrl}' style='max-width: 100%;'>`; return `<a target='_blank' href='${customMetadata.civitai_url}'>${tag}</a>`; })() : ``" },
    { label: 'civitai_creator', calc: "civitaiMetadata?.model ? `<a href='https://civitai.com/user/${civitaiMetadata?.model?.creator.username}' target='_blank'><span>${civitaiMetadata?.model?.creator.username}</span><img alt='' src='${civitaiMetadata?.model?.creator.image}' style='border-radius: 50%; float:right; width:80px; margin-top:-20px;'></img></a>`: undefined" },
    { label: 'civitai_name', calc: "customMetadata.civitai_url ? `<a target='_blank' href='${customMetadata.civitai_url}'>${civitaiMetadata?.model?.name}</a>` : undefined" },
    { label: 'base_model_url', calc: "basemodelMetadata?.modelId ? `<a target='_blank' href='https://civitai.com/models/${basemodelMetadata.modelId}?modelVersionId=${basemodelMetadata.id}'>${fileMetadata.ss_sd_model_name} (${basemodelMetadata.baseModel || civitaiMetadata.baseModel})</a>` : (fileMetadata.ss_sd_model_name.indexOf('/')>0 ? `<a target='_blank' href='https://huggingface.co/${fileMetadata.ss_sd_model_name}'>${fileMetadata.ss_sd_model_name}</a>` : fileMetadata.ss_sd_model_name)" },
    { label: 'vae_url', calc: "vaeMetadata?.modelId ? `<a target='_blank' href='https://civitai.com/models/${vaeMetadata.modelId}?modelVersionId=${vaeMetadata.id}'>${fileMetadata.ss_vae_name}</a>` : (fileMetadata.ss_vae_name.indexOf('/')>0 ? `<a target='_blank' href='https://huggingface.co/${fileMetadata.ss_vae_name}'>${fileMetadata.ss_vae_name}</a>` : fileMetadata.ss_vae_name)" },
    { label: 'arcenciel_url', calc: 'arcencielMetadata?.id ? `https://arcenciel.io/models/${arcencielMetadata.id}` : null' },
    { label: 'arcenciel_link', calc: "customMetadata.arcenciel_url ? `<a target='_blank' href='${customMetadata.arcenciel_url}'>${fileMetadata.ss_output_name || safetensorsFile.name}</a>` : fileMetadata.ss_output_name || safetensorsFile.name" },
    { label: 'arcenciel_version_index', calc: "(() => { if (Number.isInteger(arcencielMetadata?.selectedVersionIndex)) return arcencielMetadata.selectedVersionIndex; const versions = arcencielMetadata?.versions || []; if (versions.length <= 1) return 0; const sha256 = customMetadata.sha256; const sha256Auto = customMetadata.sha256_autov3; const idx = versions.findIndex(version => (sha256 && version?.sha256 === sha256) || (sha256Auto && version?.sha256webui === sha256Auto)); return idx !== -1 ? idx : 0; })()" },
    { label: 'arcenciel_selected_version', calc: 'arcencielMetadata?.selectedVersion ?? arcencielMetadata?.versions?.[customMetadata.arcenciel_version_index || 0]' },
    { label: 'arcenciel_preview', calc: "(customMetadata.arcenciel_selected_version && customMetadata.arcenciel_url) ? (() => { const version = customMetadata.arcenciel_selected_version; const filePath = version?.images?.[0]?.filePath || version?.videos?.[0]?.filePath || ''; if (!filePath) return ''; const mediaUrl = `https://arcenciel.io/uploads/${filePath}`; const isVideo = /\\.(mp4|webm)$/i.test(filePath); const tag = isVideo ? `<video src='${mediaUrl}' style='max-width: 100%;' controls autoplay muted loop></video>` : `<img src='${mediaUrl}' style='max-width: 100%;'>`; return `<a target='_blank' href='${customMetadata.arcenciel_url}'>${tag}</a>`; })() : ``" },
    { label: 'arcenciel_creator', calc: "arcencielMetadata?.uploader ? `<a href='https://arcenciel.io/users/${arcencielMetadata?.uploader?.id}' target='_blank'><span>${arcencielMetadata?.uploader?.username}</span><img alt='' src='https://arcenciel.io/uploads/${arcencielMetadata?.uploader?.profilePicture}' style='border-radius: 50%; float:right; width:80px; margin-top:-20px;'></img></a>`: undefined" },
    { label: 'arcenciel_name', calc: "customMetadata.arcenciel_url ? `<a target='_blank' href='${customMetadata.arcenciel_url}'>${arcencielMetadata?.title}</a>` : undefined" },
    { label: 'title', calc: 'customMetadata?.civitai_name || customMetadata?.arcenciel_name' },
    { label: 'link', calc: 'customMetadata?.civitai_link || customMetadata?.arcenciel_link' },
    { label: 'preview', calc: 'customMetadata?.civitai_preview || customMetadata?.arcenciel_preview' },
    { label: 'creator', calc: 'customMetadata?.civitai_creator || customMetadata?.arcenciel_creator' },
    { label: 'trigger_words', calc: 'civitaiMetadata?.trainedWords || customMetadata.arcenciel_selected_version?.activationTags' },
    { label: 'lookup_source', calc: "civitaiMetadata?.modelId ? 'CivitAI' : (arcencielMetadata?.id ? 'Arc en Ciel' : '')" },
];

export const DEFAULT_CUSTOM_TEMPLATE = `<div class="lora-dashboard-grid" style="display:flex;flex-wrap:wrap;gap:1.5rem;font-size:0.85rem;">
  <div style="max-width:320px;min-width:260px;">
    <div style="font-size:1.1rem;font-weight:700;">{{custom.link}}</div>
    <div style="opacity:0.7;">{{custom.title?}}</div>
    <div>{{custom.preview?}}</div>
    <div>Creator: {{custom.creator?}}</div>
    <div>AutoV2: {{custom.autov2?}}</div>
    <div>AutoV3: {{custom.autov3?}}</div>
    <div>Base Model: {{custom.base_model_url?}}</div>
    <div>VAE: {{custom.vae_url?}}</div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:1.5rem;">
    <div>
      <div style="font-weight:700;">General</div>
      <div>Prediction Type: {{modelspec.prediction_type?}}</div>
      <div>Batch: {{custom.batch_size?}}</div>
      <div>Gradient Acc. Steps: {{custom.gradient_accumulation?}}</div>
      <div>Resolution: {{custom.resolution?}}</div>
      <div>Clip Skip: {{ss_clip_skip?}}</div>
      <div>Epoch: {{ss_epoch?}} of {{ss_num_epochs?}}</div>
      <div>Steps: {{ss_steps?}} of {{ss_max_train_steps?}}</div>
    </div>
    <div>
      <div style="font-weight:700;">Network</div>
      <div>Module: {{ss_network_module?}}</div>
      <div>Algorithm: {{custom.algo_dora?}}</div>
      <div>Dim / Alpha: {{ss_network_dim?}} / {{ss_network_alpha?}}</div>
      <div>Conv Dim / Alpha: {{custom.conv_dim?}} / {{custom.conv_alpha?}}</div>
      <div>Network Dropout: {{ss_network_dropout?}}</div>
      <div>IP Noise Gamma: {{ss_ip_noise_gamma?}}</div>
    </div>
    <div>
      <div style="font-weight:700;">Optimizer</div>
      <div>Type: {{custom.optimizer?}}</div>
      <div>Scheduler: {{ss_lr_scheduler?}}</div>
      <div>LR: {{ss_learning_rate?}}</div>
      <div>TE: {{ss_text_encoder_lr?}}</div>
      <div>UNET: {{ss_unet_lr?}}</div>
      <div>Optional Args: {{custom.optimizer_args?}}</div>
      <div>SNR: {{ss_min_snr_gamma?}}</div>
      <div>Warmup Steps: {{ss_lr_warmup_steps?}}</div>
    </div>
    <div>
      <div style="font-weight:700;">Training Info</div>
      <div>Train Date: {{custom.training_date?}}</div>
      <div>Train Time: {{custom.training_time?}}</div>
      <div>Total Images: {{custom.training_images?}}</div>
      <div>Dataset: {{ss_dataset_dirs?}}</div>
    </div>
    <div style="flex-basis:100%;">
      <div style="font-weight:700;">Suggested Prompt</div>
      <div>{{custom.suggested_prompt?}}</div>
    </div>
    <div style="flex-basis:100%;">
      <div style="font-weight:700;">Trigger Words ({{custom.lookup_source?}})</div>
      <div>{{custom.trigger_words?}}</div>
    </div>
    <div style="flex-basis:100%;">
      <div style="font-weight:700;">Training Comment</div>
      <div>{{ss_training_comment?}}</div>
    </div>
  </div>
</div>`;

export const DEFAULT_SETTINGS: LoraEditorSettings = {
    summaryFields: DEFAULT_SUMMARY_FIELDS,
    editorFields: DEFAULT_EDITOR_FIELDS,
    showUndefinedSummaryValues: true,
    summaryLayout: 'custom',
    customFields: DEFAULT_CUSTOM_FIELDS,
    customTemplate: DEFAULT_CUSTOM_TEMPLATE,

    primaryLookup: 'civ',
    secondaryLookup: 'aec',
    enableProxy: true,
    proxyUrl: 'https://corsproxy.io/?url=',

    tagFrequencyCount: 50,
    tagFrequencyFilter: '',
    tagFrequencyFilterMethod: 'none',
    tagExcludeFilter: '',
    tagExcludeFilterMethod: 'none',
    tagByFolder: false,

    suggestedPromptCount: 10,
    suggestedPromptFilter: '',
    suggestedPromptFilterMethod: 'none',
    suggestedPromptExcludeFilter: '1girl,1boy,background,standing,portrait,cowboy shot,upper body,looking at viewer,solo,smile,open mouth,closed mouth,blush,nude,nipples,anime,male focus',
    suggestedPromptExcludeFilterMethod: 'exact',
    suggestedPromptByFolder: true,
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint`
Expected: no new errors from `components/loraEditor/types.ts` or `constants.ts`.

- [ ] **Step 3: Commit**

```bash
git add components/loraEditor/types.ts components/loraEditor/constants.ts
git commit -m "feat: add LoRA Editor shared types and ported defaults"
```

---

## Task 3: `lib/safetensors.ts` — header parse + rewrite/purge

**Files:**
- Create: `components/loraEditor/lib/safetensors.ts`
- Test: `components/loraEditor/lib/safetensors.test.ts`

**Interfaces:**
- Consumes: none (pure, only the `File`/`Blob` web APIs).
- Produces: `parseHeader(file: File): Promise<{ fileMetadata: Record<string, any>; rawMetadataStrings: Record<string, string> }>`, `buildDownloadBlob(file: File, newMetadata: Record<string, string> | null): Promise<Blob>`, `downloadFilename(originalName: string, purge: boolean): string` — used by Task 9 (parse pipeline) and Task 15 (editor download/purge).

- [ ] **Step 1: Write the failing test**

Create `components/loraEditor/lib/safetensors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHeader, buildDownloadBlob, downloadFilename } from './safetensors';

function makeSafetensorsFile(metadata: Record<string, string>, tensor: Uint8Array = new Uint8Array([1, 2, 3, 4])): File {
    const json = JSON.stringify({ __metadata__: metadata });
    const jsonBytes = new TextEncoder().encode(json);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, jsonBytes.length, true);
    return new File([header, jsonBytes, tensor], 'test.safetensors');
}

describe('parseHeader', () => {
    it('decodes __metadata__ and JSON-parses string-encoded values', async () => {
        const file = makeSafetensorsFile({ ss_network_dim: '16', ss_output_name: '"my_lora"' });
        const { fileMetadata } = await parseHeader(file);
        expect(fileMetadata.ss_network_dim).toBe(16);
        expect(fileMetadata.ss_output_name).toBe('my_lora');
    });

    it('falls back to the raw string when a value is not valid JSON', async () => {
        const file = makeSafetensorsFile({ ss_training_comment: 'not json {' });
        const { fileMetadata } = await parseHeader(file);
        expect(fileMetadata.ss_training_comment).toBe('not json {');
    });
});

describe('buildDownloadBlob', () => {
    it('round-trips updated metadata and preserves tensor bytes exactly', async () => {
        const tensor = new Uint8Array([5, 6, 7, 8]);
        const file = makeSafetensorsFile({ ss_output_name: '"old"' }, tensor);
        const blob = await buildDownloadBlob(file, { ss_output_name: '"new"' });
        const rebuilt = new File([blob], 'rebuilt.safetensors');

        const { fileMetadata } = await parseHeader(rebuilt);
        expect(fileMetadata.ss_output_name).toBe('new');

        const rebuiltBuffer = await rebuilt.arrayBuffer();
        const tail = new Uint8Array(rebuiltBuffer).slice(rebuiltBuffer.byteLength - 4);
        expect(Array.from(tail)).toEqual([5, 6, 7, 8]);
    });

    it('purges __metadata__ entirely when newMetadata is null', async () => {
        const file = makeSafetensorsFile({ ss_output_name: '"old"' });
        const blob = await buildDownloadBlob(file, null);
        const rebuilt = new File([blob], 'rebuilt.safetensors');
        const { rawMetadataStrings } = await parseHeader(rebuilt);
        expect(rawMetadataStrings).toEqual({});
    });
});

describe('downloadFilename', () => {
    it('inserts _edited or _purged before the file extension', () => {
        expect(downloadFilename('model.safetensors', false)).toBe('model_edited.safetensors');
        expect(downloadFilename('model.safetensors', true)).toBe('model_purged.safetensors');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/safetensors.test.ts`
Expected: FAIL — `Cannot find module './safetensors'`

- [ ] **Step 3: Write the implementation**

Create `components/loraEditor/lib/safetensors.ts`:

```ts
export interface ParsedSafetensors {
    fileMetadata: Record<string, any>;
    rawMetadataStrings: Record<string, string>;
}

const METADATA_SIZE_OFFSET = 0;
const METADATA_CONTENT_OFFSET = 8;

export async function parseHeader(file: File): Promise<ParsedSafetensors> {
    const sizeBuffer = await file.slice(METADATA_SIZE_OFFSET, METADATA_CONTENT_OFFSET).arrayBuffer();
    const metadataSize = new DataView(sizeBuffer).getUint32(0, true);
    const headerBuffer = await file.slice(METADATA_CONTENT_OFFSET, METADATA_CONTENT_OFFSET + metadataSize).arrayBuffer();
    const header = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(headerBuffer)));

    const rawMetadataStrings: Record<string, string> = header['__metadata__'] || {};
    const fileMetadata: Record<string, any> = {};
    for (const key in rawMetadataStrings) {
        const value = rawMetadataStrings[key];
        if (typeof value === 'string') {
            try {
                fileMetadata[key] = JSON.parse(value);
            } catch {
                fileMetadata[key] = value;
            }
        } else {
            fileMetadata[key] = value;
        }
    }
    return { fileMetadata, rawMetadataStrings };
}

export async function buildDownloadBlob(file: File, newMetadata: Record<string, string> | null): Promise<Blob> {
    const sizeBuffer = await file.slice(METADATA_SIZE_OFFSET, METADATA_CONTENT_OFFSET).arrayBuffer();
    const metadataSize = new DataView(sizeBuffer).getUint32(0, true);
    const headerBuffer = await file.slice(METADATA_CONTENT_OFFSET, METADATA_CONTENT_OFFSET + metadataSize).arrayBuffer();
    const currentHeader = JSON.parse(new TextDecoder().decode(headerBuffer));

    if (newMetadata === null) {
        delete currentHeader['__metadata__'];
    } else {
        currentHeader['__metadata__'] = newMetadata;
    }

    const newHeaderBytes = new TextEncoder().encode(JSON.stringify(currentHeader));
    const sizeArray = new Uint32Array([newHeaderBytes.length]);
    const padding = new Uint8Array([0, 0, 0, 0]); // upper 32 bits of the 8-byte little-endian size field
    const remaining = file.slice(METADATA_CONTENT_OFFSET + metadataSize);

    return new Blob([sizeArray.buffer, padding, newHeaderBytes, remaining], { type: 'application/octet-stream' });
}

export function downloadFilename(originalName: string, purge: boolean): string {
    return originalName.replace(/(\..[^.]+)$/, `_${purge ? 'purged' : 'edited'}$1`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/safetensors.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/lib/safetensors.ts components/loraEditor/lib/safetensors.test.ts
git commit -m "feat: add safetensors header parse/rewrite lib for LoRA Editor"
```

---

## Task 4: `lib/hashing.ts` — SHA-256 / AutoV2 / AutoV3 hashing

**Files:**
- Create: `components/loraEditor/lib/hashing.ts`
- Test: `components/loraEditor/lib/hashing.test.ts`
- Modify: `package.json` (add `hash-wasm` dependency)

**Interfaces:**
- Consumes: none.
- Produces: `calculateFileHashes(file: File, sizeThreshold?: number, onProgress?: (msg: string, pct: number) => void): Promise<FileHashes>` (type from Task 2) — used by Task 9's parse pipeline.

- [ ] **Step 1: Add the hash-wasm dependency**

`hash-wasm` provides incremental (chunked) SHA-256, which native `SubtleCrypto.digest` does not support — needed for files over 2GB where the whole file can't reasonably be loaded into one `ArrayBuffer` and hashed in one call, matching the original tool's >2GB code path.

```bash
pnpm add hash-wasm
```

- [ ] **Step 2: Write the failing test**

Create `components/loraEditor/lib/hashing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sha256WholeFile, sha256SkipMetadata, calculateFileHashes } from './hashing';

function makeSafetensorsFile(metadata: Record<string, string>, tensor: Uint8Array): File {
    const json = JSON.stringify({ __metadata__: metadata });
    const jsonBytes = new TextEncoder().encode(json);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, jsonBytes.length, true);
    return new File([header, jsonBytes, tensor], 'test.safetensors');
}

async function hexDigest(bytes: Uint8Array): Promise<string> {
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('sha256WholeFile', () => {
    it('hashes the entire file (header + tensor bytes)', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array([1, 2, 3]));
        const hash = await sha256WholeFile(file);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('sha256SkipMetadata', () => {
    it('hashes only the tensor bytes, excluding the header', async () => {
        const tensor = new Uint8Array([9, 9, 9]);
        const file = makeSafetensorsFile({ a: '1' }, tensor);
        const expected = await hexDigest(tensor);
        const actual = await sha256SkipMetadata(file);
        expect(actual).toBe(expected);
    });
});

describe('calculateFileHashes', () => {
    it('computes both hashes and derives autov2/autov3 prefixes under the size threshold', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array(100));
        const hashes = await calculateFileHashes(file);
        expect(hashes.sha256).toHaveLength(64);
        expect(hashes.autov2).toBe(hashes.sha256!.substring(0, 10));
        expect(hashes.sha256_autov3).toHaveLength(64);
        expect(hashes.autov3).toBe(hashes.sha256_autov3!.substring(0, 12));
    });

    it('uses the chunked hash-wasm path when the file exceeds sizeThreshold', async () => {
        const file = makeSafetensorsFile({ a: '1' }, new Uint8Array(100));
        // Force the chunked branch on a tiny file by passing a tiny threshold.
        const hashes = await calculateFileHashes(file, 10);
        expect(hashes.autov3).toHaveLength(12);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/hashing.test.ts`
Expected: FAIL — `Cannot find module './hashing'`

- [ ] **Step 4: Write the implementation**

Create `components/loraEditor/lib/hashing.ts`:

```ts
import type { FileHashes } from '../types';

const TWO_GB = 2 * 1024 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024 * 1024;

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256WholeFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return bufferToHex(await crypto.subtle.digest('SHA-256', buffer));
}

export async function sha256SkipMetadata(file: File): Promise<string> {
    const headerBuffer = await file.slice(0, 8).arrayBuffer();
    const metadataSize = new DataView(headerBuffer).getUint32(0, true);
    const rest = await file.slice(metadataSize + 8).arrayBuffer();
    return bufferToHex(await crypto.subtle.digest('SHA-256', rest));
}

async function hashInChunks(file: File, start: number, onProgress?: (pct: number) => void): Promise<string> {
    const { createSHA256 } = await import('hash-wasm');
    const hasher = await createSHA256();
    const totalBytes = file.size - start;
    const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    for (let i = 0; i < totalChunks; i++) {
        const chunkStart = start + i * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size);
        const chunk = await file.slice(chunkStart, chunkEnd).arrayBuffer();
        hasher.update(new Uint8Array(chunk));
        onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }
    return hasher.digest('hex');
}

export async function sha256WholeFileChunked(file: File, onProgress?: (pct: number) => void): Promise<string> {
    return hashInChunks(file, 0, onProgress);
}

export async function sha256SkipMetadataChunked(file: File, onProgress?: (pct: number) => void): Promise<string> {
    const headerBuffer = await file.slice(0, 8).arrayBuffer();
    const metadataSize = new DataView(headerBuffer).getUint32(0, true);
    return hashInChunks(file, metadataSize + 8, onProgress);
}

export async function calculateFileHashes(
    file: File,
    sizeThreshold: number = TWO_GB,
    onProgress?: (message: string, pct: number) => void
): Promise<FileHashes> {
    const result: FileHashes = {};

    if (file.size > sizeThreshold) {
        try {
            result.sha256_autov3 = await sha256SkipMetadataChunked(file, (p) => onProgress?.('Calculating AutoV3 hash...', p));
        } catch {
            result.sha256 = await sha256WholeFileChunked(file, (p) => onProgress?.('Calculating AutoV2 hash...', p));
        }
    } else {
        onProgress?.('Calculating AutoV2 hash...', 25);
        result.sha256 = await sha256WholeFile(file);
        onProgress?.('Calculating AutoV3 hash...', 50);
        result.sha256_autov3 = await sha256SkipMetadata(file);
    }

    if (result.sha256) result.autov2 = result.sha256.substring(0, 10);
    if (result.sha256_autov3) result.autov3 = result.sha256_autov3.substring(0, 12);
    return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/hashing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml components/loraEditor/lib/hashing.ts components/loraEditor/lib/hashing.test.ts
git commit -m "feat: add file hashing lib (SHA-256/AutoV2/AutoV3) for LoRA Editor"
```

---

## Task 5: `lib/customFields.ts` — eval-based custom field evaluator

**Files:**
- Create: `components/loraEditor/lib/customFields.ts`
- Test: `components/loraEditor/lib/customFields.test.ts`

**Interfaces:**
- Consumes: `CustomFieldDef`, `CustomFieldContext` from `../types` (Task 2).
- Produces: `evaluateCustomFields(defs: CustomFieldDef[], context: CustomFieldContext, seed?: Record<string, any>): Record<string, any>` — used by Task 9's parse pipeline. `seed` pre-populates `customMetadata` before any expression runs, so non-eval-derived values (file hashes, computed by Task 4's `calculateFileHashes`, not by a custom field expression) are visible to `calc` expressions that reference them (e.g. the default `arcenciel_version_index` field reads `customMetadata.sha256`) — mirroring the original tool, where `calculateFileHashes()` writes `sha256`/`autov2`/`sha256_autov3`/`autov3` directly into the same long-lived `customMetadata` object that the eval expressions later read from.

- [ ] **Step 1: Write the failing test**

Create `components/loraEditor/lib/customFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateCustomFields } from './customFields';
import type { CustomFieldContext } from '../types';

function baseContext(overrides: Partial<CustomFieldContext> = {}): CustomFieldContext {
    return {
        fileMetadata: {},
        civitaiMetadata: {},
        arcencielMetadata: {},
        basemodelMetadata: {},
        vaeMetadata: {},
        safetensorsFile: null,
        ...overrides,
    };
}

describe('evaluateCustomFields', () => {
    it('evaluates expressions in declaration order, later fields can reference earlier customMetadata', () => {
        const defs = [
            { label: 'a', calc: 'fileMetadata.x + 1' },
            { label: 'b', calc: 'customMetadata.a * 2' },
        ];
        const result = evaluateCustomFields(defs, baseContext({ fileMetadata: { x: 5 } }));
        expect(result).toEqual({ a: 6, b: 12 });
    });

    it('swallows evaluation errors and continues with remaining fields', () => {
        const defs = [
            { label: 'bad', calc: 'nonexistent.property' },
            { label: 'ok', calc: '1 + 1' },
        ];
        const result = evaluateCustomFields(defs, baseContext());
        expect(result.bad).toBeUndefined();
        expect(result.ok).toBe(2);
    });

    it('has access to fileMetadata, civitaiMetadata, and safetensorsFile by name', () => {
        const file = new File(['x'], 'model.safetensors');
        const defs = [
            { label: 'name', calc: 'safetensorsFile.name' },
            { label: 'modelId', calc: 'civitaiMetadata.modelId' },
        ];
        const result = evaluateCustomFields(defs, baseContext({ safetensorsFile: file, civitaiMetadata: { modelId: 42 } }));
        expect(result.name).toBe('model.safetensors');
        expect(result.modelId).toBe(42);
    });

    it('skips malformed definitions without throwing', () => {
        const defs = [{ label: 'ok' } as any, { calc: '1' } as any, { label: 'good', calc: '2' }];
        const result = evaluateCustomFields(defs, baseContext());
        expect(result).toEqual({ good: 2 });
    });

    it('seeds customMetadata so expressions can reference pre-computed values (e.g. file hashes)', () => {
        const defs = [{ label: 'short_hash', calc: 'customMetadata.sha256.substring(0, 4)' }];
        const result = evaluateCustomFields(defs, baseContext(), { sha256: 'abcdef123456' });
        expect(result.short_hash).toBe('abcd');
        expect(result.sha256).toBe('abcdef123456');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/customFields.test.ts`
Expected: FAIL — `Cannot find module './customFields'`

- [ ] **Step 3: Write the implementation**

Create `components/loraEditor/lib/customFields.ts`:

```ts
import type { CustomFieldDef, CustomFieldContext } from '../types';

/**
 * Ports LoRA-Edit's eval()-based custom field system. Expressions are user-authored
 * (defaults ship with the app, editable in settings) and run against local file data —
 * same trust model as the original tool. Uses `new Function` with explicit named
 * parameters instead of the original's `window`-global approach, so no globals are polluted.
 */
export function evaluateCustomFields(defs: CustomFieldDef[], context: CustomFieldContext, seed: Record<string, any> = {}): Record<string, any> {
    const { fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, safetensorsFile } = context;
    const customMetadata: Record<string, any> = { ...seed };

    for (const def of defs) {
        if (!def || typeof def.label !== 'string' || typeof def.calc !== 'string') continue;
        try {
            // eslint-disable-next-line no-new-func
            const evaluator = new Function(
                'fileMetadata', 'civitaiMetadata', 'arcencielMetadata', 'basemodelMetadata', 'vaeMetadata', 'customMetadata', 'safetensorsFile',
                `return (${def.calc});`
            );
            customMetadata[def.label] = evaluator(fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, customMetadata, safetensorsFile);
        } catch (e) {
            if (def.showError) console.warn(`Error evaluating expression for custom field "${def.label}".`, def, e);
        }
    }

    return customMetadata;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/customFields.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/lib/customFields.ts components/loraEditor/lib/customFields.test.ts
git commit -m "feat: add eval-based custom fields lib for LoRA Editor"
```

---

## Task 6: `lib/templating.ts` — `{{field}}` substitution and field resolution

**Files:**
- Create: `components/loraEditor/lib/templating.ts`
- Test: `components/loraEditor/lib/templating.test.ts`

**Interfaces:**
- Consumes: none directly (works on plain objects).
- Produces: `replacePlaceholders(text: string, resolveField: (field: string) => any, undefinedText?: string | null): string`, `resolveField(field: string, ctx: FieldResolverContext, showUndefined: boolean): any`, `FieldResolverContext` type — used by Task 12 (SummaryPanel).

- [ ] **Step 1: Write the failing test**

Create `components/loraEditor/lib/templating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { replacePlaceholders, resolveField } from './templating';

describe('replacePlaceholders', () => {
    const data: Record<string, any> = { name: 'foo', obj: { a: 1 } };
    const resolve = (field: string) => data[field];

    it('substitutes known fields with their string value', () => {
        expect(replacePlaceholders('Hello {{name}}', resolve)).toBe('Hello foo');
    });

    it('stringifies object values as a JSON block', () => {
        expect(replacePlaceholders('{{obj}}', resolve)).toContain('"a": 1');
    });

    it('removes optional placeholders (trailing ?) when the value is undefined', () => {
        expect(replacePlaceholders('[{{missing?}}]', resolve)).toBe('[]');
    });

    it('falls back to undefinedText when provided and the value is undefined', () => {
        expect(replacePlaceholders('{{missing}}', resolve, '-')).toBe('-');
    });
});

describe('resolveField', () => {
    const ctx = {
        fileMetadata: { a: 1 },
        civitaiMetadata: { b: 2 },
        arcencielMetadata: { c: 3 },
        customMetadata: { d: 4 },
    };

    it('resolves unprefixed fields from fileMetadata', () => {
        expect(resolveField('a', ctx, false)).toBe(1);
    });

    it('resolves civitai./arcenciel./custom.-prefixed fields from the matching source', () => {
        expect(resolveField('civitai.b', ctx, false)).toBe(2);
        expect(resolveField('arcenciel.c', ctx, false)).toBe(3);
        expect(resolveField('custom.d', ctx, false)).toBe(4);
    });

    it('returns undefined, or the string "undefined" when showUndefined is true', () => {
        expect(resolveField('missing', ctx, false)).toBeUndefined();
        expect(resolveField('missing', ctx, true)).toBe('undefined');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/templating.test.ts`
Expected: FAIL — `Cannot find module './templating'`

- [ ] **Step 3: Write the implementation**

Create `components/loraEditor/lib/templating.ts`:

```ts
export interface FieldResolverContext {
    fileMetadata: Record<string, any>;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    customMetadata: Record<string, any>;
}

export function resolveField(field: string, ctx: FieldResolverContext, showUndefined: boolean): any {
    if (field.startsWith('civitai.')) {
        const key = field.slice(8);
        if (ctx.civitaiMetadata && key in ctx.civitaiMetadata) return ctx.civitaiMetadata[key];
    } else if (field.startsWith('arcenciel.')) {
        const key = field.slice(10);
        if (ctx.arcencielMetadata && key in ctx.arcencielMetadata) return ctx.arcencielMetadata[key];
    } else if (field.startsWith('custom.')) {
        const key = field.slice(7);
        if (ctx.customMetadata && key in ctx.customMetadata) return ctx.customMetadata[key];
    } else if (field in ctx.fileMetadata) {
        return ctx.fileMetadata[field];
    }
    return showUndefined ? 'undefined' : undefined;
}

export function replacePlaceholders(text: string, resolve: (field: string) => any, undefinedText: string | null = null): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawPlaceholder: string) => {
        let placeholder = rawPlaceholder.replace(/\s/g, '');
        let optional = false;
        if (placeholder.endsWith('?')) {
            optional = true;
            placeholder = placeholder.slice(0, -1);
        }
        const value = resolve(placeholder);
        if (value !== null && typeof value === 'object') return `<pre>${JSON.stringify(value, null, 2)}</pre>`;
        if (value !== undefined && value !== 'undefined') return String(value);
        if (optional) return '';
        if (undefinedText !== null) return undefinedText;
        return `<span class="opacity-30 italic">undefined</span>`;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/templating.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/lib/templating.ts components/loraEditor/lib/templating.test.ts
git commit -m "feat: add templating/field-resolution lib for LoRA Editor"
```

---

## Task 7: `lib/tagTools.ts` — tag frequency aggregation and filtering

**Files:**
- Create: `components/loraEditor/lib/tagTools.ts`
- Test: `components/loraEditor/lib/tagTools.test.ts`

**Interfaces:**
- Consumes: `FilterMethod` from `../types` (Task 2).
- Produces: `aggregateAndSort`, `sortSubproperties`, `convertNumericKeysToString`, `filterTopN`, `filterByTag`, `removeTags`, `isValidRegex`, `applyFiltersToSubproperties`, `listToRegex`, `getSuggestedPrompt`, `buildFilterRegex(method: FilterMethod, value: string): RegExp | string | null`, `applyTagFilters(tags: Record<string, any>, options: TagFilterOptions): Record<string, any>`, `TagFilterOptions` type — used by Task 13 (TagFrequencyPanel/SuggestedPromptPanel), which both call `applyTagFilters` instead of duplicating the include/exclude/top-N/by-folder branch logic.

- [ ] **Step 1: Write the failing test**

Create `components/loraEditor/lib/tagTools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    aggregateAndSort, sortSubproperties, convertNumericKeysToString,
    filterTopN, filterByTag, removeTags, isValidRegex, applyFiltersToSubproperties,
    listToRegex, getSuggestedPrompt, buildFilterRegex, applyTagFilters,
} from './tagTools';

describe('aggregateAndSort', () => {
    it('sums tag counts across folders and sorts descending', () => {
        const input = { folderA: { cat: 2, dog: 9 }, folderB: { cat: 3 } };
        // dog=9, cat=2+3=5 -> unambiguous descending order (no tie), unlike an equal-count fixture
        // which would leave the result order-dependent on Array.sort's stability plus insertion order.
        expect(aggregateAndSort(input)).toEqual({ dog: 9, cat: 5 });
        expect(Object.keys(aggregateAndSort(input))).toEqual(['dog', 'cat']);
    });
});

describe('sortSubproperties', () => {
    it('sorts each folder subobject by count descending', () => {
        const input = { folderA: { cat: 1, dog: 9 } };
        expect(sortSubproperties(input)).toEqual({ folderA: { dog: 9, cat: 1 } });
    });
});

describe('convertNumericKeysToString', () => {
    it('wraps purely-numeric subkeys in parentheses', () => {
        const input = { folder: { '1girl': 5, '123': 2 } };
        expect(convertNumericKeysToString(input)).toEqual({ folder: { '1girl': 5, '(123)': 2 } });
    });
});

describe('filterTopN', () => {
    it('keeps only the first N entries', () => {
        expect(filterTopN({ a: 1, b: 2, c: 3 }, 2)).toEqual({ a: 1, b: 2 });
    });
});

describe('filterByTag / removeTags', () => {
    const tags = { cat: 5, dog: 3, catfish: 1 };
    it('filterByTag keeps only keys matching the pattern', () => {
        expect(filterByTag(tags, /^cat$/)).toEqual({ cat: 5 });
    });
    it('removeTags deletes keys matching the pattern', () => {
        expect(removeTags({ ...tags }, /^cat$/)).toEqual({ dog: 3, catfish: 1 });
    });
});

describe('isValidRegex', () => {
    it('returns true for valid patterns and false for invalid ones', () => {
        expect(isValidRegex('^abc$')).toBe(true);
        expect(isValidRegex('(unterminated')).toBe(false);
    });
});

describe('applyFiltersToSubproperties', () => {
    it('applies a filter function to every folder subobject', () => {
        const input = { folderA: { cat: 5, dog: 1 }, folderB: { cat: 2 } };
        const result = applyFiltersToSubproperties(input, filterByTag, /^cat$/);
        expect(result).toEqual({ folderA: { cat: 5 }, folderB: { cat: 2 } });
    });
});

describe('listToRegex', () => {
    it('builds a partial-match regex from a comma-separated list', () => {
        const re = listToRegex('cat, dog');
        expect(re.test('catfish')).toBe(true);
        expect('cat, dog'.split(',').every(v => re.test(v.trim()))).toBe(true);
    });
    it('builds an exact-match regex when exactMatch is true', () => {
        const re = listToRegex('cat, dog', true);
        expect(re.test('catfish')).toBe(false);
        expect(re.test('cat')).toBe(true);
    });
    it('escapes regex special characters in list values', () => {
        const re = listToRegex('a.b', true);
        expect(re.test('aXb')).toBe(false);
        expect(re.test('a.b')).toBe(true);
    });
});

describe('getSuggestedPrompt', () => {
    it('joins flat tag objects into a single Prompt string', () => {
        expect(getSuggestedPrompt({ cat: 5, dog: 3 })).toEqual({ Prompt: 'cat, dog' });
    });
    it('joins per-folder nested tag objects into one prompt per folder', () => {
        expect(getSuggestedPrompt({ folderA: { cat: 5 }, folderB: { dog: 3 } })).toEqual({ folderA: 'cat', folderB: 'dog' });
    });
    it('returns undefined for falsy input', () => {
        expect(getSuggestedPrompt(undefined as any)).toBeUndefined();
    });
});

describe('buildFilterRegex', () => {
    it('builds a partial-match regex for method "partial"', () => {
        const re = buildFilterRegex('partial', 'cat, dog');
        expect(re && (re as RegExp).test('catfish')).toBe(true);
    });
    it('builds an exact-match regex for method "exact"', () => {
        const re = buildFilterRegex('exact', 'cat');
        expect(re && (re as RegExp).test('catfish')).toBe(false);
    });
    it('passes the raw string through for method "regex"', () => {
        expect(buildFilterRegex('regex', '^cat$')).toBe('^cat$');
    });
    it('returns null for method "none" or an empty value', () => {
        expect(buildFilterRegex('none', 'cat')).toBeNull();
        expect(buildFilterRegex('partial', '')).toBeNull();
    });
});

describe('applyTagFilters', () => {
    const flatTags = { cat: 5, dog: 3, catfish: 1 };
    const folderTags = { folderA: { cat: 5, dog: 3 }, folderB: { catfish: 1 } };

    it('applies include/exclude/top-N on flat tags when byFolder is false', () => {
        const result = applyTagFilters(flatTags, {
            byFolder: false, filterMethod: 'exact', filter: 'cat, catfish',
            excludeFilterMethod: 'none', excludeFilter: '', count: 1,
        });
        expect(result).toEqual({ cat: 5 });
    });

    it('applies the same filters per-folder when byFolder is true', () => {
        const result = applyTagFilters(folderTags, {
            byFolder: true, filterMethod: 'none', filter: '',
            excludeFilterMethod: 'exact', excludeFilter: 'catfish', count: 0,
        });
        expect(result).toEqual({ folderA: { cat: 5, dog: 3 }, folderB: {} });
    });

    it('ignores invalid regex filters instead of throwing', () => {
        const result = applyTagFilters(flatTags, {
            byFolder: false, filterMethod: 'regex', filter: '(unterminated',
            excludeFilterMethod: 'none', excludeFilter: '', count: 0,
        });
        expect(result).toEqual(flatTags);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/tagTools.test.ts`
Expected: FAIL — `Cannot find module './tagTools'`

- [ ] **Step 3: Write the implementation**

Create `components/loraEditor/lib/tagTools.ts`:

```ts
import type { FilterMethod } from '../types';

export function aggregateAndSort(originalObject: Record<string, Record<string, number>>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(
            Object.values(originalObject).reduce((acc: Record<string, number>, subObject) => {
                for (const [key, value] of Object.entries(subObject)) {
                    acc[key] = (acc[key] || 0) + value;
                }
                return acc;
            }, {})
        ).sort(([, a], [, b]) => b - a)
    );
}

export function sortSubproperties(originalObject: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
    return Object.fromEntries(
        Object.entries(originalObject).map(([key, subObject]) => [
            key,
            Object.fromEntries(Object.entries(subObject).sort(([, a], [, b]) => b - a)),
        ])
    );
}

export function convertNumericKeysToString(originalObject: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    for (const [key, value] of Object.entries(originalObject)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const nested: Record<string, any> = {};
            for (const [subKey, subValue] of Object.entries(value)) {
                const newSubKey = !isNaN(Number(subKey)) ? `(${subKey})` : subKey;
                nested[newSubKey] = subValue;
            }
            converted[key] = nested;
        } else {
            converted[key] = value;
        }
    }
    return converted;
}

export function filterTopN<T extends Record<string, any>>(obj: T, n: number | string): T {
    return Object.fromEntries(Object.entries(obj).slice(0, Number(n))) as T;
}

export function filterByTag<T extends Record<string, any>>(obj: T, regex: string | RegExp): T {
    const pattern = typeof regex === 'string' ? new RegExp(regex) : regex;
    const filtered: Record<string, any> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (pattern.test(key) || (typeof obj[key] === 'string' && pattern.test(obj[key]))) filtered[key] = obj[key];
        }
    }
    return filtered as T;
}

export function removeTags<T extends Record<string, any>>(obj: T, regex: string | RegExp): T {
    const pattern = typeof regex === 'string' ? new RegExp(regex) : regex;
    Object.keys(obj).forEach((property) => {
        if (pattern.test(property)) delete (obj as any)[property];
    });
    return obj;
}

export function isValidRegex(regexString: string | RegExp): boolean {
    try {
        new RegExp(regexString);
        return true;
    } catch {
        return false;
    }
}

export function applyFiltersToSubproperties<T extends Record<string, any>>(
    obj: Record<string, T>,
    filterFunction: (subObject: T, ...args: any[]) => T,
    ...args: any[]
): Record<string, T> {
    const filtered: Record<string, T> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) filtered[key] = filterFunction(obj[key], ...args);
    }
    return filtered;
}

export function listToRegex(listString: string, exactMatch = false): RegExp {
    const values = listString.split(',').map((v) => v.trim());
    const escaped = values.map((v) => v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = exactMatch ? `^(${escaped.join('|')})$` : `(${escaped.join('|')})`;
    return new RegExp(pattern);
}

export function getSuggestedPrompt(tags: Record<string, any> | undefined): Record<string, string> | undefined {
    if (!tags) return undefined;
    const keys = Object.keys(tags);
    const prompts: Record<string, string> = {};
    if (typeof tags[keys[0]] !== 'object') {
        prompts.Prompt = Object.keys(tags).join(', ');
    } else {
        for (const property in tags) {
            if (Object.prototype.hasOwnProperty.call(tags, property)) prompts[property] = Object.keys(tags[property]).join(', ');
        }
    }
    return prompts;
}

export function buildFilterRegex(method: FilterMethod, value: string): RegExp | string | null {
    switch (method) {
        case 'regex': return value || null;
        case 'exact': return value ? listToRegex(value, true) : null;
        case 'partial': return value ? listToRegex(value) : null;
        default: return null;
    }
}

export interface TagFilterOptions {
    byFolder: boolean;
    filterMethod: FilterMethod;
    filter: string;
    excludeFilterMethod: FilterMethod;
    excludeFilter: string;
    count: number;
}

/**
 * Shared by TagFrequencyPanel and SuggestedPromptPanel (Task 13): both apply the
 * same include/exclude/top-N/by-folder pipeline to a tag object, just with different
 * settings-field sources and a different final render. Invalid regexes are ignored
 * rather than thrown, matching the original tool's validation-then-skip behavior.
 */
export function applyTagFilters(tags: Record<string, any>, options: TagFilterOptions): Record<string, any> {
    const includeRegex = buildFilterRegex(options.filterMethod, options.filter);
    const excludeRegex = buildFilterRegex(options.excludeFilterMethod, options.excludeFilter);
    const validInclude = includeRegex !== null && isValidRegex(includeRegex);
    const validExclude = excludeRegex !== null && isValidRegex(excludeRegex);

    let result: Record<string, any> = JSON.parse(JSON.stringify(tags));

    if (options.byFolder) {
        if (validInclude) result = applyFiltersToSubproperties(result, filterByTag, includeRegex as RegExp | string);
        if (validExclude) result = applyFiltersToSubproperties(result, removeTags, excludeRegex as RegExp | string);
        if (options.count > 0) result = applyFiltersToSubproperties(result, filterTopN, options.count);
    } else {
        if (validInclude) result = filterByTag(result, includeRegex as RegExp | string);
        if (validExclude) result = removeTags(result, excludeRegex as RegExp | string);
        if (options.count > 0) result = filterTopN(result, options.count);
    }
    return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/tagTools.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/lib/tagTools.ts components/loraEditor/lib/tagTools.test.ts
git commit -m "feat: add tag frequency/filtering lib for LoRA Editor"
```

---

## Task 8: `lib/onlineLookup.ts` — CivitAI / Arc en Ciel lookup

**Files:**
- Create: `components/loraEditor/lib/onlineLookup.ts`
- Test: `components/loraEditor/lib/onlineLookup.test.ts`

**Interfaces:**
- Consumes: `LookupResult`, `LookupSource` from `../types` (Task 2).
- Produces: `getCivitAiData(hash: string): Promise<LookupResult | null>`, `getArcEnCielData(hash: string, proxyUrl: string | null): Promise<LookupResult | null>`, `getModelDataByHash(hash: string, primary: LookupSource, secondary: LookupSource, proxyUrl: string | null): Promise<LookupResult | null>`, `isProxyAvailable(proxyUrl: string): Promise<boolean>` — used by Task 14 (OnlineLookupPanel) and Task 9 (base model/VAE lookups in the parse pipeline).

- [ ] **Step 1: Write the failing test**

Create `components/loraEditor/lib/onlineLookup.test.ts`. This mocks `global.fetch` since these functions call CivitAI/Arc en Ciel directly (per the design spec, no server-side proxy is introduced):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCivitAiData, getArcEnCielData, getModelDataByHash, isProxyAvailable } from './onlineLookup';

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('getCivitAiData', () => {
    it('returns null when hash is empty', async () => {
        expect(await getCivitAiData('')).toBeNull();
    });

    it('fetches by-hash then the model, and assembles a LookupResult', async () => {
        const byHash = { modelId: 111, id: 222 };
        const model = { name: 'Test Model' };
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => byHash })
            .mockResolvedValueOnce({ ok: true, json: async () => model }) as any;

        const result = await getCivitAiData('abc123');
        expect(result?.source).toBe('CivitAI');
        expect(result?.data.model).toEqual(model);
        expect(result?.modelUrl).toBe('https://civitai.com/models/111?modelVersionId=222');
    });

    it('returns null when the by-hash lookup 404s', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;
        expect(await getCivitAiData('abc123')).toBeNull();
    });
});

describe('getArcEnCielData', () => {
    it('returns null when hash is empty', async () => {
        expect(await getArcEnCielData('', null)).toBeNull();
    });

    it('routes through the proxy URL when provided', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 5 }] }) }) as any;
        await getArcEnCielData('abc123', 'https://proxy.example/?url=');
        const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
        expect(calledUrl.startsWith('https://proxy.example/?url=')).toBe(true);
        expect(calledUrl).toContain('arcenciel.io');
    });
});

describe('getModelDataByHash', () => {
    it('falls back to the secondary source when the primary finds nothing', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: false }) // civ by-hash miss
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 9 }] }) }) as any; // aec hit
        const result = await getModelDataByHash('hash', 'civ', 'aec', null);
        expect(result?.source).toBe('Arc En Ciel');
    });

    it('returns null when both lookups are disabled', async () => {
        const result = await getModelDataByHash('hash', '', '', null);
        expect(result).toBeNull();
    });
});

describe('isProxyAvailable', () => {
    it('returns true when the proxy responds ok', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
        expect(await isProxyAvailable('https://proxy.example/?url=')).toBe(true);
    });
    it('returns false on network error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
        expect(await isProxyAvailable('https://proxy.example/?url=')).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/loraEditor/lib/onlineLookup.test.ts`
Expected: FAIL — `Cannot find module './onlineLookup'`

- [ ] **Step 3: Write the implementation**

Create `components/loraEditor/lib/onlineLookup.ts`:

```ts
import type { LookupResult, LookupSource } from '../types';

async function onlineLookupFetch(url: string): Promise<any | null> {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
}

export async function isProxyAvailable(proxyUrl: string): Promise<boolean> {
    try {
        const response = await fetch(proxyUrl + 'https://www.civitai.com');
        return response.ok;
    } catch {
        return false;
    }
}

export async function getCivitAiData(hash: string): Promise<LookupResult | null> {
    if (!hash) return null;
    const baseApiUrl = 'https://civitai.com/api/v1/model-versions/by-hash/';
    const modelApiUrl = 'https://civitai.com/api/v1/models/';
    const baseModelUrl = 'https://civitai.com/models/';
    try {
        const versionData = await onlineLookupFetch(baseApiUrl + hash);
        if (!versionData || !versionData.modelId) return null;
        const model = await onlineLookupFetch(modelApiUrl + versionData.modelId);
        if (!model) return null;
        return {
            data: { ...versionData, model },
            hash,
            modelUrl: `${baseModelUrl}${versionData.modelId}?modelVersionId=${versionData.id}`,
            resourceUrl: baseApiUrl + hash,
            source: 'CivitAI',
        };
    } catch (error) {
        console.error('Error fetching CivitAI data:', error);
        return null;
    }
}

export async function getArcEnCielData(hash: string, proxyUrl: string | null): Promise<LookupResult | null> {
    if (!hash) return null;
    const baseApiUrl = 'https://arcenciel.io/api/models/search?search=';
    const baseModelUrl = 'https://arcenciel.io/models/';
    const targetUrl = baseApiUrl + hash;
    const fetchUrl = proxyUrl ? proxyUrl + targetUrl : targetUrl;
    try {
        const response = await onlineLookupFetch(fetchUrl);
        const first = response?.data?.[0];
        if (!first) return null;
        return {
            data: first,
            hash,
            modelUrl: baseModelUrl + first.id,
            resourceUrl: targetUrl,
            source: 'Arc En Ciel',
        };
    } catch (error) {
        console.error('Error fetching Arc En Ciel data:', error);
        return null;
    }
}

async function lookupBySource(source: LookupSource, hash: string, proxyUrl: string | null): Promise<LookupResult | null> {
    switch (source) {
        case 'civ': return getCivitAiData(hash);
        case 'aec': return getArcEnCielData(hash, proxyUrl);
        default: return null;
    }
}

export async function getModelDataByHash(
    hash: string,
    primary: LookupSource,
    secondary: LookupSource,
    proxyUrl: string | null
): Promise<LookupResult | null> {
    let result = await lookupBySource(primary, hash, proxyUrl);
    if (!result && secondary && secondary !== primary) {
        result = await lookupBySource(secondary, hash, proxyUrl);
    }
    return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/loraEditor/lib/onlineLookup.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/lib/onlineLookup.ts components/loraEditor/lib/onlineLookup.test.ts
git commit -m "feat: add CivitAI/Arc en Ciel online lookup lib for LoRA Editor"
```

---

## Task 9: Parse pipeline — wire libs into `LoraEditorPage.tsx`

**Files:**
- Modify: `components/loraEditor/LoraEditorPage.tsx` (replaces Task 1's stub body)

**Interfaces:**
- Consumes: `parseHeader`, `buildDownloadBlob`, `downloadFilename` (Task 3); `calculateFileHashes` (Task 4); `evaluateCustomFields` (Task 5); `getModelDataByHash` (Task 8); `DEFAULT_SETTINGS` (Task 2).
- Produces: internal state shape `{ file, fileMetadata, rawMetadataStrings, hashes, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, customMetadata, settings, activeTab, isSettingsOpen, isLoading, loadingMessage }` and a `LoraEditorContext` (via props, not React context — panels are direct children) — Tasks 10-16 read/write this state through props passed down from `LoraEditorPage`.

This task has no new automated test (it's integration/orchestration wiring over already-tested libs); verification is manual via the dev server, consistent with how `ImageResizer.tsx` and other utility pages are built in this codebase.

- [ ] **Step 1: Replace LoraEditorPage.tsx with the full state + parse pipeline**

Replace the entire contents of `components/loraEditor/LoraEditorPage.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, panelVariants, sectionWipeVariants, TerminalText } from '../AnimatedPanels';
import { UploadIcon } from '../icons';
import useLocalStorage from '../../utils/useLocalStorage';
import { parseHeader } from './lib/safetensors';
import { calculateFileHashes } from './lib/hashing';
import { evaluateCustomFields } from './lib/customFields';
import { getModelDataByHash } from './lib/onlineLookup';
import { aggregateAndSort, sortSubproperties, convertNumericKeysToString } from './lib/tagTools';
import { DEFAULT_SETTINGS } from './constants';
import type { LoraEditorSettings, FileHashes } from './types';

export type LoraEditorTab = 'summary' | 'tags' | 'metadata' | 'editor' | 'lookup';

export interface LoraEditorState {
    file: File | null;
    fileMetadata: Record<string, any>;
    rawMetadataStrings: Record<string, string>;
    hashes: FileHashes;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    basemodelMetadata: Record<string, any>;
    vaeMetadata: Record<string, any>;
    customMetadata: Record<string, any>;
    tagsByFolder: Record<string, Record<string, number>>;
    tagsAggregated: Record<string, number>;
}

const EMPTY_STATE: LoraEditorState = {
    file: null,
    fileMetadata: {},
    rawMetadataStrings: {},
    hashes: {},
    civitaiMetadata: {},
    arcencielMetadata: {},
    basemodelMetadata: {},
    vaeMetadata: {},
    customMetadata: {},
    tagsByFolder: {},
    tagsAggregated: {},
};

interface LoraEditorPageProps {
    isExiting?: boolean;
}

const LoraEditorPage: React.FC<LoraEditorPageProps> = ({ isExiting = false }) => {
    const [settings, setSettings] = useLocalStorage<LoraEditorSettings>('loraEditorSettings', DEFAULT_SETTINGS);
    const [state, setState] = useState<LoraEditorState>(EMPTY_STATE);
    const [activeTab, setActiveTab] = useState<LoraEditorTab>('summary');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const recomputeCustomMetadata = useCallback((partial: Partial<LoraEditorState>, currentSettings: LoraEditorSettings) => {
        // Seed customMetadata with the hashes computed in Task 4's lib/hashing.ts — these aren't
        // produced by any calc expression, but several default custom fields (e.g. arcenciel_version_index)
        // read customMetadata.sha256/.sha256_autov3, mirroring the original tool where calculateFileHashes()
        // writes hashes directly into the same customMetadata object the eval expressions read from.
        const seed = {
            sha256: partial.hashes?.sha256,
            autov2: partial.hashes?.autov2,
            sha256_autov3: partial.hashes?.sha256_autov3,
            autov3: partial.hashes?.autov3,
        };
        return evaluateCustomFields(currentSettings.customFields, {
            fileMetadata: partial.fileMetadata || {},
            civitaiMetadata: partial.civitaiMetadata || {},
            arcencielMetadata: partial.arcencielMetadata || {},
            basemodelMetadata: partial.basemodelMetadata || {},
            vaeMetadata: partial.vaeMetadata || {},
            safetensorsFile: partial.file ?? null,
        }, seed);
    }, []);

    const runLookups = useCallback(async (base: LoraEditorState, currentSettings: LoraEditorSettings) => {
        if (!currentSettings.primaryLookup) return base;
        setLoadingMessage('Looking up model...');

        const proxyUrl = currentSettings.enableProxy ? currentSettings.proxyUrl : null;
        const civAutov2 = base.hashes.autov2;
        const civAutov3 = base.hashes.autov3;
        const sha256 = base.hashes.sha256;
        const sha256Autov3 = base.hashes.sha256_autov3;

        // Primary/secondary resource lookup: CivitAI keys on AutoV2/AutoV3 short hashes,
        // Arc en Ciel keys on full SHA-256. Try both hash forms per the original tool.
        const primaryHash = currentSettings.primaryLookup === 'civ' ? (civAutov2 || civAutov3) : (sha256 || sha256Autov3);
        let lookupResult = primaryHash ? await getModelDataByHash(primaryHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl) : null;

        let civitaiMetadata = base.civitaiMetadata;
        let arcencielMetadata = base.arcencielMetadata;
        if (lookupResult?.source === 'CivitAI') civitaiMetadata = lookupResult.data;
        else if (lookupResult?.source === 'Arc En Ciel') arcencielMetadata = lookupResult.data;

        let basemodelMetadata = base.basemodelMetadata;
        let vaeMetadata = base.vaeMetadata;
        const baseModelHash = base.fileMetadata.ss_new_sd_model_hash || base.fileMetadata.ss_sd_model_hash;
        if (baseModelHash) {
            setLoadingMessage('Looking up base model...');
            const baseInfo = await getModelDataByHash(baseModelHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl);
            if (baseInfo) basemodelMetadata = baseInfo.data;
        }
        const vaeHash = base.fileMetadata.ss_new_vae_hash || base.fileMetadata.ss_vae_hash;
        if (vaeHash) {
            setLoadingMessage('Looking up VAE...');
            const vaeInfo = await getModelDataByHash(vaeHash, currentSettings.primaryLookup, currentSettings.secondaryLookup, proxyUrl);
            if (vaeInfo) vaeMetadata = vaeInfo.data;
        }

        const next: LoraEditorState = { ...base, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata };
        next.customMetadata = { ...next.customMetadata, ...recomputeCustomMetadata(next, currentSettings) };
        return next;
    }, [recomputeCustomMetadata]);

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files);
        const file = list.find(f => f.name.endsWith('.safetensors') || f.name.endsWith('.gguf'));
        if (!file) return;

        setIsLoading(true);
        setState(EMPTY_STATE);

        try {
            let fileMetadata: Record<string, any> = {};
            let rawMetadataStrings: Record<string, string> = {};
            if (file.name.endsWith('.safetensors')) {
                setLoadingMessage('Parsing metadata...');
                const parsed = await parseHeader(file);
                fileMetadata = parsed.fileMetadata;
                rawMetadataStrings = parsed.rawMetadataStrings;
            }

            setLoadingMessage('Calculating hashes...');
            const hashes = await calculateFileHashes(file, undefined, (msg) => setLoadingMessage(msg));

            let tagsByFolder: Record<string, Record<string, number>> = {};
            let tagsAggregated: Record<string, number> = {};
            if (fileMetadata['ss_tag_frequency']) {
                const normalized = convertNumericKeysToString(fileMetadata['ss_tag_frequency']);
                tagsByFolder = sortSubproperties(normalized);
                tagsAggregated = aggregateAndSort(normalized);
            }

            let next: LoraEditorState = {
                file, fileMetadata, rawMetadataStrings, hashes,
                civitaiMetadata: {}, arcencielMetadata: {}, basemodelMetadata: {}, vaeMetadata: {},
                customMetadata: {}, tagsByFolder, tagsAggregated,
            };
            next.customMetadata = recomputeCustomMetadata(next, settings);

            next = await runLookups(next, settings);

            setState(next);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [settings, recomputeCustomMetadata, runLookups]);

    const handleReset = useCallback(() => setState(EMPTY_STATE), []);

    return (
        <div className="flex flex-col h-full w-full relative overflow-visible p-0 bg-transparent">
            <motion.div
                variants={panelVariants}
                initial="hidden"
                animate={isExiting ? 'exit' : 'visible'}
                exit="exit"
                className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-6 bg-base-100/10 backdrop-blur-md flex items-center justify-between">
                        <TerminalText text="LORA EDITOR" delay={2.0} className="text-[10px] font-black uppercase text-primary" />
                        {state.file && (
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-mono text-base-content/40 truncate max-w-xs">{state.file.name}</span>
                                <button onClick={handleReset} className="form-btn h-7 px-3 text-[10px]">CLEAR</button>
                                <button onClick={() => setIsSettingsOpen(true)} className="form-btn h-7 px-3 text-[10px]">SETTINGS</button>
                            </div>
                        )}
                    </motion.header>
                    <div className="flex-grow p-6 bg-transparent relative flex flex-col overflow-hidden">
                        {isLoading ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-primary animate-pulse">{loadingMessage || 'Processing...'}</span>
                            </div>
                        ) : !state.file ? (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                                onDragEnter={() => setIsDragging(true)}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                            >
                                <label className={`w-full h-full rounded-none flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'bg-primary/10' : 'hover:bg-base-200/20'}`}>
                                    <input type="file" accept=".safetensors,.gguf" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                                    <UploadIcon className="w-16 h-16 text-base-content/20 mb-6" />
                                    <h2 className="text-2xl font-black uppercase tracking-tighter">DROP LORA FILE</h2>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-base-content/40 mt-2 px-4 text-center">.safetensors or .gguf — drop or click to select</p>
                                </label>
                            </div>
                        ) : (
                            <div className="text-xs font-mono text-base-content/60 overflow-y-auto">
                                {Object.keys(state.fileMetadata).length} metadata fields parsed. AutoV2: {state.hashes.autov2 || 'n/a'}, AutoV3: {state.hashes.autov3 || 'n/a'}.
                                {/* Task 16 replaces this block with the tab bar + panels. */}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoraEditorPage;
```

- [ ] **Step 2: Manual verification**

```bash
pnpm run dev
```

Drop a real `.safetensors` LoRA file (or any file you have handy — kohya-trained LoRAs work best) onto the page. Confirm:
- The loading message appears briefly.
- After loading, the summary line shows a nonzero metadata field count and AutoV2/AutoV3 hash prefixes.
- The browser devtools Network tab shows requests to `civitai.com` (confirming the lookup ran) if the file's hash matches a known CivitAI resource — a miss is fine, the point is confirming no crash and no CSP block.
- `CLEAR` returns to the drop zone.

- [ ] **Step 3: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/loraEditor/LoraEditorPage.tsx
git commit -m "feat: wire safetensors parse/hash/lookup pipeline into LoRA Editor page"
```

---

## Task 10: `SettingsDrawer.tsx`

**Files:**
- Create: `components/loraEditor/SettingsDrawer.tsx`
- Modify: `components/loraEditor/LoraEditorPage.tsx` (render the drawer, pass `settings`/`setSettings`/`isSettingsOpen`/`onClose`)

**Interfaces:**
- Consumes: `LoraEditorSettings`, `CustomFieldDef` (Task 2); `SettingRow`, `ProviderTab`, `SettingsGroup` from `../settings/primitives` (existing).
- Produces: `SettingsDrawer` component, `React.FC<{ isOpen: boolean; onClose: () => void; settings: LoraEditorSettings; onChange: (next: LoraEditorSettings) => void }>`.

- [ ] **Step 1: Create the settings drawer**

Create `components/loraEditor/SettingsDrawer.tsx`:

```tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SettingRow, ProviderTab, SettingsGroup } from '../settings/primitives';
import { CloseIcon } from '../icons';
import type { LoraEditorSettings, CustomFieldDef } from './types';

type DrawerTab = 'general' | 'summary' | 'editor' | 'customFields' | 'lookup';

interface SettingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: LoraEditorSettings;
    onChange: (next: LoraEditorSettings) => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose, settings, onChange }) => {
    const [tab, setTab] = useState<DrawerTab>('general');

    const set = <K extends keyof LoraEditorSettings>(key: K, value: LoraEditorSettings[K]) => onChange({ ...settings, [key]: value });

    const updateCustomField = (index: number, patch: Partial<CustomFieldDef>) => {
        const next = settings.customFields.slice();
        next[index] = { ...next[index], ...patch };
        set('customFields', next);
    };
    const addCustomField = () => set('customFields', [...settings.customFields, { label: '', calc: '' }]);
    const removeCustomField = (index: number) => set('customFields', settings.customFields.filter((_, i) => i !== index));

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[600] bg-base-100/80 backdrop-blur-sm flex justify-end"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                        className="w-full max-w-2xl h-full bg-base-100 border-l border-base-content/10 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-base-content/10">
                            <h2 className="text-xs font-black uppercase tracking-widest">LoRA Editor Settings</h2>
                            <button onClick={onClose} className="form-btn h-8 w-8 flex items-center justify-center"><CloseIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="flex gap-1 p-2 border-b border-base-content/10">
                            <ProviderTab label="General" isActive={tab === 'general'} onClick={() => setTab('general')} />
                            <ProviderTab label="Summary" isActive={tab === 'summary'} onClick={() => setTab('summary')} />
                            <ProviderTab label="Editor" isActive={tab === 'editor'} onClick={() => setTab('editor')} />
                            <ProviderTab label="Custom Fields" isActive={tab === 'customFields'} onClick={() => setTab('customFields')} />
                            <ProviderTab label="Online Lookup" isActive={tab === 'lookup'} onClick={() => setTab('lookup')} />
                        </div>

                        {tab === 'general' && (
                            <SettingsGroup title="General">
                                <SettingRow label="Show Undefined Summary Values" desc="Display 'undefined' instead of hiding fields with no value.">
                                    <input type="checkbox" checked={settings.showUndefinedSummaryValues} onChange={(e) => set('showUndefinedSummaryValues', e.target.checked)} className="checkbox checkbox-primary" />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'summary' && (
                            <SettingsGroup title="Summary Fields">
                                <SettingRow label="Layout" desc="JSON: raw key/value dump. Table: one row per field. Dashboard: the custom HTML template below.">
                                    <select value={settings.summaryLayout} onChange={(e) => set('summaryLayout', e.target.value as LoraEditorSettings['summaryLayout'])} className="form-select">
                                        <option value="json">JSON</option>
                                        <option value="table">Table</option>
                                        <option value="custom">Dashboard</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Fields" desc="Comma-separated field names. Prefix with civitai./custom. for those sources.">
                                    <textarea value={settings.summaryFields} onChange={(e) => set('summaryFields', e.target.value)} rows={6} className="form-textarea w-full font-mono text-xs" spellCheck={false} />
                                </SettingRow>
                                <SettingRow label="Custom Dashboard Template" desc="HTML template with {{field}} placeholders. {{field?}} omits the field entirely when undefined.">
                                    <textarea value={settings.customTemplate} onChange={(e) => set('customTemplate', e.target.value)} rows={16} className="form-textarea w-full font-mono text-[10px]" spellCheck={false} />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'editor' && (
                            <SettingsGroup title="Metadata Editor Fields">
                                <SettingRow label="Fields" desc="Comma-separated field names shown in the editor's Simple view.">
                                    <textarea value={settings.editorFields} onChange={(e) => set('editorFields', e.target.value)} rows={4} className="form-textarea w-full font-mono text-xs" spellCheck={false} />
                                </SettingRow>
                            </SettingsGroup>
                        )}

                        {tab === 'customFields' && (
                            <SettingsGroup title="Custom Fields">
                                <div className="p-6 space-y-3">
                                    <p className="text-[10px] text-base-content/40 uppercase tracking-widest leading-relaxed">
                                        JavaScript expressions evaluated in order. Available: fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, customMetadata (earlier fields), safetensorsFile.
                                    </p>
                                    {settings.customFields.map((field, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <input value={field.label} onChange={(e) => updateCustomField(i, { label: e.target.value })} placeholder="label" className="form-input w-40 font-mono text-xs flex-shrink-0" />
                                            <textarea value={field.calc} onChange={(e) => updateCustomField(i, { calc: e.target.value })} placeholder="calculation" rows={2} className="form-textarea flex-grow font-mono text-xs" spellCheck={false} />
                                            <button onClick={() => removeCustomField(i)} className="form-btn h-8 px-2 text-error/60 hover:text-error flex-shrink-0">X</button>
                                        </div>
                                    ))}
                                    <button onClick={addCustomField} className="form-btn h-8 px-3 text-[10px]">ADD CUSTOM FIELD</button>
                                </div>
                            </SettingsGroup>
                        )}

                        {tab === 'lookup' && (
                            <SettingsGroup title="Resource Lookup">
                                <SettingRow label="Primary Lookup">
                                    <select value={settings.primaryLookup} onChange={(e) => set('primaryLookup', e.target.value as LoraEditorSettings['primaryLookup'])} className="form-select">
                                        <option value="">Disabled</option>
                                        <option value="civ">CivitAI</option>
                                        <option value="aec">Arc En Ciel</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Secondary Lookup">
                                    <select value={settings.secondaryLookup} onChange={(e) => set('secondaryLookup', e.target.value as LoraEditorSettings['secondaryLookup'])} className="form-select">
                                        <option value="">Disabled</option>
                                        <option value="civ">CivitAI</option>
                                        <option value="aec">Arc En Ciel</option>
                                    </select>
                                </SettingRow>
                                <SettingRow label="Use HTTP Proxy for Arc En Ciel" desc="Required for Arc En Ciel lookups due to CORS restrictions.">
                                    <input type="checkbox" checked={settings.enableProxy} onChange={(e) => set('enableProxy', e.target.checked)} className="checkbox checkbox-primary" />
                                </SettingRow>
                                <SettingRow label="Proxy URL">
                                    <input value={settings.proxyUrl} onChange={(e) => set('proxyUrl', e.target.value)} className="form-input w-full font-mono text-xs" />
                                </SettingRow>
                            </SettingsGroup>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SettingsDrawer;
```

- [ ] **Step 2: Wire the drawer into LoraEditorPage.tsx**

In `components/loraEditor/LoraEditorPage.tsx`, add the import:

```tsx
import SettingsDrawer from './SettingsDrawer';
```

If Task 9's implementation added a `void isSettingsOpen;` line (a `noUnusedLocals` workaround for `isSettingsOpen` having no reader yet), delete that line now — this step gives `isSettingsOpen` its first real reader, making the suppression both unnecessary and dead code.

Add the drawer just before the closing `</div>` of the root element (after the main `motion.div`):

```tsx
            <SettingsDrawer
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                onChange={setSettings}
            />
```

- [ ] **Step 3: Manual verification**

```bash
pnpm run dev
```

Load a file, click SETTINGS, confirm the drawer slides in, all five tabs render, editing a field (e.g. toggling "Show Undefined Summary Values") persists after closing/reopening the drawer and after a page reload (localStorage).

- [ ] **Step 4: Commit**

```bash
git add components/loraEditor/SettingsDrawer.tsx components/loraEditor/LoraEditorPage.tsx
git commit -m "feat: add LoRA Editor settings drawer"
```

---

## Task 11: `MetadataPanel.tsx` — raw JSON viewer

**Files:**
- Create: `components/loraEditor/MetadataPanel.tsx`

**Interfaces:**
- Consumes: `react-syntax-highlighter` (existing dependency).
- Produces: `MetadataPanel` component, `React.FC<{ fileMetadata: Record<string, any> }>` — used by Task 16's tab bar.

- [ ] **Step 1: Create the panel**

Create `components/loraEditor/MetadataPanel.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CopyIcon } from '../icons';

interface MetadataPanelProps {
    fileMetadata: Record<string, any>;
}

const MetadataPanel: React.FC<MetadataPanelProps> = ({ fileMetadata }) => {
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(fileMetadata, null, 2);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [json]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-end p-2 border-b border-base-content/10">
                <button onClick={handleCopy} className="form-btn h-7 px-3 text-[10px] flex items-center gap-2">
                    <CopyIcon className="w-3 h-3" /> {copied ? 'COPIED' : 'COPY'}
                </button>
            </div>
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {json}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default MetadataPanel;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/loraEditor/MetadataPanel.tsx
git commit -m "feat: add LoRA Editor raw metadata panel"
```

---

## Task 12: `SummaryPanel.tsx` — JSON / Table / Dashboard layouts

**Files:**
- Create: `components/loraEditor/SummaryPanel.tsx`

**Interfaces:**
- Consumes: `replacePlaceholders`, `resolveField` (Task 6); `LoraEditorSettings` (Task 2).
- Produces: `SummaryPanel` component, `React.FC<{ state: LoraEditorState; settings: LoraEditorSettings }>` — used by Task 16's tab bar.

- [ ] **Step 1: Create the panel**

Create `components/loraEditor/SummaryPanel.tsx`:

```tsx
import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { replacePlaceholders, resolveField } from './lib/templating';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface SummaryPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ state, settings }) => {
    const fieldContext = useMemo(() => ({
        fileMetadata: state.fileMetadata,
        civitaiMetadata: state.civitaiMetadata,
        arcencielMetadata: state.arcencielMetadata,
        customMetadata: state.customMetadata,
    }), [state]);

    const resolve = (field: string) => resolveField(field, fieldContext, settings.showUndefinedSummaryValues);

    const summaryJson = useMemo(() => {
        const fields = settings.summaryFields.split(',').map(f => f.trim()).filter(Boolean);
        return Object.fromEntries(fields.map(f => [f, resolve(f)]));
    }, [settings.summaryFields, fieldContext, settings.showUndefinedSummaryValues]);

    if (settings.summaryLayout === 'json') {
        return (
            <div className="h-full overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(summaryJson, null, 2)}
                </SyntaxHighlighter>
            </div>
        );
    }

    if (settings.summaryLayout === 'table') {
        return (
            <table className="w-full text-xs font-mono">
                <tbody>
                    {Object.entries(summaryJson).map(([key, value]) => (
                        <tr key={key} className="border-b border-base-content/5">
                            <td className="p-2 opacity-50 whitespace-nowrap align-top">{key}</td>
                            <td className="p-2 break-words" dangerouslySetInnerHTML={{ __html: typeof value === 'object' ? `<pre>${JSON.stringify(value, null, 2)}</pre>` : String(value) }} />
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    // Dashboard layout: renders the user-configured HTML template with {{field}} substitution.
    // Values embedded here may themselves contain HTML produced by custom fields (e.g. civitai_link,
    // civitai_preview) — same self-XSS trust model accepted for the eval-based custom fields.
    const html = replacePlaceholders(settings.customTemplate, resolve, "<span class='opacity-30'>-</span>");
    return <div className="h-full overflow-auto text-xs" dangerouslySetInnerHTML={{ __html: html }} />;
};

export default SummaryPanel;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/loraEditor/SummaryPanel.tsx
git commit -m "feat: add LoRA Editor summary panel (JSON/table/dashboard layouts)"
```

---

## Task 13: `TagFrequencyPanel.tsx` + `SuggestedPromptPanel.tsx`

**Files:**
- Create: `components/loraEditor/TagFilterControls.tsx` (shared filter UI)
- Create: `components/loraEditor/TagFrequencyPanel.tsx`
- Create: `components/loraEditor/SuggestedPromptPanel.tsx`

**Interfaces:**
- Consumes: `applyTagFilters`, `TagFilterOptions`, `getSuggestedPrompt` (Task 7); `LoraEditorState`, `LoraEditorSettings`.
- Produces: `TagFrequencyPanel: React.FC<{ state: LoraEditorState; settings: LoraEditorSettings; onSettingsChange: (next: LoraEditorSettings) => void }>`, `SuggestedPromptPanel` with the same signature — used by Task 16's tab bar.

- [ ] **Step 1: Create the shared filter controls**

Create `components/loraEditor/TagFilterControls.tsx`. This is presentational only — the filtering logic itself lives in Task 7's `applyTagFilters`, shared by both panels below instead of being duplicated:

```tsx
import React from 'react';
import type { FilterMethod } from './types';

export interface TagFilterValues {
    count: number;
    filter: string;
    filterMethod: FilterMethod;
    excludeFilter: string;
    excludeFilterMethod: FilterMethod;
    byFolder: boolean;
}

interface TagFilterControlsProps {
    values: TagFilterValues;
    onChange: (values: TagFilterValues) => void;
}

const METHODS: { value: FilterMethod; label: string }[] = [
    { value: 'none', label: 'None/Disable' },
    { value: 'partial', label: 'Partial Match (comma delimited)' },
    { value: 'exact', label: 'Exact Match (comma delimited)' },
    { value: 'regex', label: 'Regular Expression' },
];

const TagFilterControls: React.FC<TagFilterControlsProps> = ({ values, onChange }) => {
    const set = <K extends keyof TagFilterValues>(key: K, value: TagFilterValues[K]) => onChange({ ...values, [key]: value });

    return (
        <div className="flex flex-wrap gap-3 items-end p-3 bg-base-200/20 text-[10px]">
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Top N</span>
                <input type="number" value={values.count} onChange={(e) => set('count', Number(e.target.value))} className="form-input w-20 h-7" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Include Filter</span>
                <div className="flex gap-1">
                    <input value={values.filter} onChange={(e) => set('filter', e.target.value)} className="form-input h-7 w-40" />
                    <select value={values.filterMethod} onChange={(e) => set('filterMethod', e.target.value as FilterMethod)} className="form-select h-7">
                        {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </label>
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Exclude Filter</span>
                <div className="flex gap-1">
                    <input value={values.excludeFilter} onChange={(e) => set('excludeFilter', e.target.value)} className="form-input h-7 w-40" />
                    <select value={values.excludeFilterMethod} onChange={(e) => set('excludeFilterMethod', e.target.value as FilterMethod)} className="form-select h-7">
                        {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </label>
            <label className="flex items-center gap-2 pb-1">
                <input type="checkbox" checked={values.byFolder} onChange={(e) => set('byFolder', e.target.checked)} className="checkbox checkbox-xs checkbox-primary" />
                <span className="uppercase opacity-40">By Folder</span>
            </label>
        </div>
    );
};

export default TagFilterControls;
```

- [ ] **Step 2: Create TagFrequencyPanel.tsx**

Create `components/loraEditor/TagFrequencyPanel.tsx`:

```tsx
import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TagFilterControls from './TagFilterControls';
import { applyTagFilters } from './lib/tagTools';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface TagFrequencyPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onSettingsChange: (next: LoraEditorSettings) => void;
}

const TagFrequencyPanel: React.FC<TagFrequencyPanelProps> = ({ state, settings, onSettingsChange }) => {
    const filtered = useMemo(() => applyTagFilters(settings.tagByFolder ? state.tagsByFolder : state.tagsAggregated, {
        byFolder: settings.tagByFolder,
        filterMethod: settings.tagFrequencyFilterMethod,
        filter: settings.tagFrequencyFilter,
        excludeFilterMethod: settings.tagExcludeFilterMethod,
        excludeFilter: settings.tagExcludeFilter,
        count: settings.tagFrequencyCount,
    }), [state.tagsByFolder, state.tagsAggregated, settings.tagByFolder, settings.tagFrequencyFilter, settings.tagFrequencyFilterMethod, settings.tagExcludeFilter, settings.tagExcludeFilterMethod, settings.tagFrequencyCount]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TagFilterControls
                values={{
                    count: settings.tagFrequencyCount, filter: settings.tagFrequencyFilter, filterMethod: settings.tagFrequencyFilterMethod,
                    excludeFilter: settings.tagExcludeFilter, excludeFilterMethod: settings.tagExcludeFilterMethod, byFolder: settings.tagByFolder,
                }}
                onChange={(v) => onSettingsChange({
                    ...settings, tagFrequencyCount: v.count, tagFrequencyFilter: v.filter, tagFrequencyFilterMethod: v.filterMethod,
                    tagExcludeFilter: v.excludeFilter, tagExcludeFilterMethod: v.excludeFilterMethod, tagByFolder: v.byFolder,
                })}
            />
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(filtered, null, 2)}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default TagFrequencyPanel;
```

- [ ] **Step 3: Create SuggestedPromptPanel.tsx**

Create `components/loraEditor/SuggestedPromptPanel.tsx`:

```tsx
import React, { useMemo } from 'react';
import TagFilterControls from './TagFilterControls';
import { applyTagFilters, getSuggestedPrompt } from './lib/tagTools';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface SuggestedPromptPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onSettingsChange: (next: LoraEditorSettings) => void;
}

const SuggestedPromptPanel: React.FC<SuggestedPromptPanelProps> = ({ state, settings, onSettingsChange }) => {
    const prompt = useMemo(() => {
        const filtered = applyTagFilters(settings.suggestedPromptByFolder ? state.tagsByFolder : state.tagsAggregated, {
            byFolder: settings.suggestedPromptByFolder,
            filterMethod: settings.suggestedPromptFilterMethod,
            filter: settings.suggestedPromptFilter,
            excludeFilterMethod: settings.suggestedPromptExcludeFilterMethod,
            excludeFilter: settings.suggestedPromptExcludeFilter,
            count: settings.suggestedPromptCount,
        });
        const built = getSuggestedPrompt(filtered);
        if (!settings.suggestedPromptByFolder && built) return { Prompt: built.Prompt };
        return built || {};
    }, [state.tagsByFolder, state.tagsAggregated, settings.suggestedPromptByFolder, settings.suggestedPromptFilter, settings.suggestedPromptFilterMethod, settings.suggestedPromptExcludeFilter, settings.suggestedPromptExcludeFilterMethod, settings.suggestedPromptCount]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TagFilterControls
                values={{
                    count: settings.suggestedPromptCount, filter: settings.suggestedPromptFilter, filterMethod: settings.suggestedPromptFilterMethod,
                    excludeFilter: settings.suggestedPromptExcludeFilter, excludeFilterMethod: settings.suggestedPromptExcludeFilterMethod, byFolder: settings.suggestedPromptByFolder,
                }}
                onChange={(v) => onSettingsChange({
                    ...settings, suggestedPromptCount: v.count, suggestedPromptFilter: v.filter, suggestedPromptFilterMethod: v.filterMethod,
                    suggestedPromptExcludeFilter: v.excludeFilter, suggestedPromptExcludeFilterMethod: v.excludeFilterMethod, suggestedPromptByFolder: v.byFolder,
                })}
            />
            <div className="flex-grow overflow-auto p-4">
                <table className="w-full text-xs font-mono">
                    <tbody>
                        {Object.entries(prompt).map(([key, value]) => (
                            <tr key={key} className="border-b border-base-content/5">
                                <td className="p-2 opacity-50 whitespace-nowrap align-top">{key}</td>
                                <td className="p-2 break-words cursor-pointer hover:text-primary" onClick={() => navigator.clipboard.writeText(String(value))} title="Click to copy">{String(value)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SuggestedPromptPanel;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/loraEditor/TagFilterControls.tsx components/loraEditor/TagFrequencyPanel.tsx components/loraEditor/SuggestedPromptPanel.tsx
git commit -m "feat: add LoRA Editor tag frequency and suggested prompt panels"
```

---

## Task 14: `OnlineLookupPanel.tsx`

**Files:**
- Create: `components/loraEditor/OnlineLookupPanel.tsx`

**Interfaces:**
- Consumes: `LoraEditorState` (Task 9).
- Produces: `OnlineLookupPanel` component, `React.FC<{ state: LoraEditorState }>` — used by Task 16's tab bar. (Lookups themselves already ran in Task 9's pipeline; this panel is display-only, matching the original's `onlineLookupPanel` which is purely a display of state already fetched during `handleFile`.)

- [ ] **Step 1: Create the panel**

Create `components/loraEditor/OnlineLookupPanel.tsx`:

```tsx
import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { LoraEditorState } from './LoraEditorPage';

interface OnlineLookupPanelProps {
    state: LoraEditorState;
}

const OnlineLookupPanel: React.FC<OnlineLookupPanelProps> = ({ state }) => {
    const source = state.civitaiMetadata?.modelId ? 'civitai' : (state.arcencielMetadata?.id ? 'arcenciel' : null);
    const data = source === 'civitai' ? state.civitaiMetadata : source === 'arcenciel' ? state.arcencielMetadata : null;

    const previewUrl = useMemo(() => {
        if (source === 'civitai') return data?.images?.[0]?.url;
        if (source === 'arcenciel') {
            const version = data?.versions?.[0];
            const filePath = version?.images?.[0]?.filePath || version?.videos?.[0]?.filePath;
            return filePath ? `https://arcenciel.io/uploads/${filePath}` : undefined;
        }
        return undefined;
    }, [source, data]);

    const modelUrl = source === 'civitai'
        ? `https://civitai.com/models/${data.modelId}?modelVersionId=${data.id}`
        : source === 'arcenciel' ? `https://arcenciel.io/models/${data.id}` : null;

    if (!source) {
        return <div className="h-full flex items-center justify-center text-xs text-base-content/40 uppercase tracking-widest">No matching resource found</div>;
    }

    const isVideo = previewUrl ? /\.(mp4|webm)$/i.test(previewUrl) : false;

    return (
        <div className="flex flex-col h-full overflow-auto p-4 gap-4">
            <div className="text-[10px] uppercase tracking-widest opacity-40">Source: {source === 'civitai' ? 'CivitAI' : 'Arc En Ciel'}</div>
            <table className="text-xs font-mono">
                <tbody>
                    <tr><td className="opacity-50 pr-4 align-top">Model URL</td><td><a href={modelUrl!} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{modelUrl}</a></td></tr>
                </tbody>
            </table>
            {previewUrl && (
                <div className="max-w-md">
                    {isVideo
                        ? <video src={previewUrl} controls autoPlay muted loop className="w-full" />
                        : <img src={previewUrl} alt="preview" className="w-full" />}
                </div>
            )}
            <div className="flex-grow overflow-auto text-xs">
                <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', fontSize: '11px' }}>
                    {JSON.stringify(data, null, 2)}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default OnlineLookupPanel;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/loraEditor/OnlineLookupPanel.tsx
git commit -m "feat: add LoRA Editor online lookup display panel"
```

---

## Task 15: `MetadataEditorPanel.tsx` — edit + download/purge

**Files:**
- Create: `components/loraEditor/MetadataEditorPanel.tsx`

**Interfaces:**
- Consumes: `buildDownloadBlob`, `downloadFilename` (Task 3); `LoraEditorState`, `LoraEditorSettings`.
- Produces: `MetadataEditorPanel` component, `React.FC<{ state: LoraEditorState; settings: LoraEditorSettings; onFeedback: (message: string, isError?: boolean) => void }>` — used by Task 16's tab bar.

- [ ] **Step 1: Create the panel**

Create `components/loraEditor/MetadataEditorPanel.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { buildDownloadBlob, downloadFilename } from './lib/safetensors';
import type { LoraEditorState } from './LoraEditorPage';
import type { LoraEditorSettings } from './types';

interface MetadataEditorPanelProps {
    state: LoraEditorState;
    settings: LoraEditorSettings;
    onFeedback: (message: string, isError?: boolean) => void;
}

const MetadataEditorPanel: React.FC<MetadataEditorPanelProps> = ({ state, settings, onFeedback }) => {
    const [format, setFormat] = useState<'manual' | 'simple'>('manual');
    const [editorText, setEditorText] = useState('');

    useEffect(() => {
        setEditorText(JSON.stringify(state.rawMetadataStrings, null, 2));
    }, [state.file]);

    const editorFields = settings.editorFields.split(',').map(f => f.trim()).filter(Boolean);

    const parseEditorText = useCallback((): Record<string, string> | null => {
        try {
            const parsed = JSON.parse(editorText || '{}');
            for (const key of ['ss_dataset_dirs', 'ss_bucket_info', 'ss_tag_frequency']) {
                if (parsed[key] !== undefined) JSON.parse(parsed[key]);
            }
            return parsed;
        } catch (e) {
            onFeedback(`Error parsing edited metadata. Ensure it is valid JSON (and that ss_dataset_dirs/ss_bucket_info/ss_tag_frequency are valid JSON strings).`, true);
            return null;
        }
    }, [editorText, onFeedback]);

    const handleSimpleFieldChange = (field: string, value: string) => {
        const parsed = JSON.parse(editorText || '{}');
        parsed[field] = value;
        setEditorText(JSON.stringify(parsed, null, 2));
    };

    const triggerDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownload = async (purge: boolean) => {
        if (!state.file) return;
        try {
            const newMetadata = purge ? null : parseEditorText();
            if (!purge && newMetadata === null) return;
            const blob = await buildDownloadBlob(state.file, newMetadata);
            triggerDownload(blob, downloadFilename(state.file.name, purge));
            onFeedback(`Metadata ${purge ? 'purged' : 'updated'} successfully!`);
        } catch (e) {
            onFeedback(`An error occurred while writing the file: ${e instanceof Error ? e.message : String(e)}`, true);
        }
    };

    let simpleValues: Record<string, string> = {};
    try { simpleValues = JSON.parse(editorText || '{}'); } catch { /* left empty; manual view still shows the raw invalid text */ }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-base-content/10">
                <select value={format} onChange={(e) => setFormat(e.target.value as 'manual' | 'simple')} className="form-select h-7 text-[10px]">
                    <option value="manual">Manual</option>
                    <option value="simple">Simple</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={() => handleDownload(false)} className="form-btn h-7 px-3 text-[10px]">UPDATE &amp; DOWNLOAD</button>
                    <button onClick={() => handleDownload(true)} className="form-btn h-7 px-3 text-[10px] text-error/70 hover:text-error">PURGE &amp; DOWNLOAD</button>
                </div>
            </div>
            <div className="flex-grow overflow-auto p-2">
                {format === 'manual' ? (
                    <textarea value={editorText} onChange={(e) => setEditorText(e.target.value)} className="form-textarea w-full h-full font-mono text-[11px]" spellCheck={false} />
                ) : (
                    <table className="w-full text-xs font-mono">
                        <tbody>
                            {editorFields.map((field) => (
                                <tr key={field}>
                                    <td className="p-2 opacity-50 whitespace-nowrap align-top">{field}</td>
                                    <td className="p-2"><input value={simpleValues[field] ?? ''} onChange={(e) => handleSimpleFieldChange(field, e.target.value)} className="form-input w-full" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default MetadataEditorPanel;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/loraEditor/MetadataEditorPanel.tsx
git commit -m "feat: add LoRA Editor metadata editor panel (update/purge download)"
```

---

## Task 16: Assemble the tab bar and final wiring

**Files:**
- Modify: `components/loraEditor/LoraEditorPage.tsx` (replace the placeholder content block from Task 9 with the tab bar + panels; add `showGlobalFeedback`-style local toast state)

**Interfaces:**
- Consumes: `MetadataPanel` (Task 11), `SummaryPanel` (Task 12), `TagFrequencyPanel`/`SuggestedPromptPanel` (Task 13), `OnlineLookupPanel` (Task 14), `MetadataEditorPanel` (Task 15).

- [ ] **Step 1: Add panel imports and a local feedback toast to LoraEditorPage.tsx**

In `components/loraEditor/LoraEditorPage.tsx`, add imports:

```tsx
import MetadataPanel from './MetadataPanel';
import SummaryPanel from './SummaryPanel';
import TagFrequencyPanel from './TagFrequencyPanel';
import SuggestedPromptPanel from './SuggestedPromptPanel';
import OnlineLookupPanel from './OnlineLookupPanel';
import MetadataEditorPanel from './MetadataEditorPanel';
```

Add feedback toast state near the other `useState` calls:

```tsx
    const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
    const showFeedback = useCallback((message: string, isError = false) => {
        setFeedback({ message, isError });
        setTimeout(() => setFeedback(null), 4000);
    }, []);
```

- [ ] **Step 2: Replace the placeholder content block with the tab bar + panels**

Replace this block from Task 9 (the `<div className="text-xs font-mono ...">` placeholder):

```tsx
                        ) : (
                            <div className="text-xs font-mono text-base-content/60 overflow-y-auto">
                                {Object.keys(state.fileMetadata).length} metadata fields parsed. AutoV2: {state.hashes.autov2 || 'n/a'}, AutoV3: {state.hashes.autov3 || 'n/a'}.
                                {/* Task 16 replaces this block with the tab bar + panels. */}
                            </div>
                        )}
```

with:

```tsx
                        ) : (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex gap-1 border-b border-base-content/10 mb-2 flex-shrink-0">
                                    {([
                                        ['summary', 'Summary'], ['tags', 'Tag Frequency'], ['prompt', 'Suggested Prompt'],
                                        ['metadata', 'Metadata'], ['editor', 'Editor'], ['lookup', 'Online Lookup'],
                                    ] as const).map(([id, label]) => (
                                        <button
                                            key={id}
                                            onClick={() => setActiveTab(id as any)}
                                            className={`px-3 h-8 text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === id ? 'text-primary border-b-2 border-primary' : 'text-base-content/40 hover:text-base-content'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-grow overflow-hidden">
                                    {activeTab === 'summary' && <SummaryPanel state={state} settings={settings} />}
                                    {activeTab === 'tags' && <TagFrequencyPanel state={state} settings={settings} onSettingsChange={setSettings} />}
                                    {activeTab === 'prompt' && <SuggestedPromptPanel state={state} settings={settings} onSettingsChange={setSettings} />}
                                    {activeTab === 'metadata' && <MetadataPanel fileMetadata={state.fileMetadata} />}
                                    {activeTab === 'editor' && <MetadataEditorPanel state={state} settings={settings} onFeedback={showFeedback} />}
                                    {activeTab === 'lookup' && <OnlineLookupPanel state={state} />}
                                </div>
                            </div>
                        )}
```

- [ ] **Step 3: Widen the `LoraEditorTab` type and update `activeTab` usage**

In the same file, update the `LoraEditorTab` type definition (near the top) to include the two tabs added by the tab bar above:

```tsx
export type LoraEditorTab = 'summary' | 'tags' | 'prompt' | 'metadata' | 'editor' | 'lookup';
```

- [ ] **Step 4: Render the feedback toast**

Add just before the closing `</div>` of the root element (after `<SettingsDrawer .../>`):

```tsx
            {feedback && (
                <div className={`fixed bottom-6 right-6 z-[700] px-4 py-3 text-xs font-bold uppercase tracking-widest ${feedback.isError ? 'bg-error text-error-content' : 'bg-primary text-primary-content'}`}>
                    {feedback.message}
                </div>
            )}
```

- [ ] **Step 5: Manual end-to-end verification**

```bash
pnpm run dev
```

Walk the full flow:
1. Open Utilities → LoRA Editor.
2. Drop a real kohya-trained `.safetensors` LoRA file.
3. Click through all six tabs (Summary, Tag Frequency, Suggested Prompt, Metadata, Editor, Online Lookup) — confirm each renders without a console error.
4. In Settings → Summary, switch the Layout dropdown between JSON/Table/Dashboard and confirm the Summary tab's rendering changes accordingly for each option.
5. In Editor, edit `ss_output_name` in the Manual textarea, click "UPDATE & DOWNLOAD" — confirm a `..._edited.safetensors` file downloads and its size roughly matches the original.
6. Click "PURGE & DOWNLOAD" — confirm a `..._purged.safetensors` file downloads.
7. Click CLEAR, confirm it returns to the drop zone cleanly with no leftover state.

- [ ] **Step 6: Typecheck and test suite**

```bash
pnpm run lint
pnpm run test
```

Expected: no new type errors; all `components/loraEditor/**/*.test.ts` files pass (safetensors: 5, hashing: 4, customFields: 5, templating: 7, tagTools: 21, onlineLookup: 8 — 50 tests total).

- [ ] **Step 7: Commit**

```bash
git add components/loraEditor/LoraEditorPage.tsx
git commit -m "feat: assemble LoRA Editor tab bar and complete panel wiring"
```
