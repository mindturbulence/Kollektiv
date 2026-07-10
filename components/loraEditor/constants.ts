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
