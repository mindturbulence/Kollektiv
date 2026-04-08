const sortModels = (models: string[]) => {
  const defaultItem = models.find(m => m.startsWith('Default'));
  const others = models.filter(m => !m.startsWith('Default')).sort((a, b) => a.localeCompare(b));
  return defaultItem ? [defaultItem, ...others] : others;
};

export const TARGET_IMAGE_AI_MODELS = sortModels([
  'FLUX.2 [pro]',
  'FLUX.1.1 [pro]',
  'FLUX.1 [dev/schnell]',
  'Midjourney v7',
  'Midjourney v6.1',
  'Google Imagen 4',
  'Google Imagen 3',
  'Stable Diffusion 4.0 Large',
  'Stable Diffusion 3.5 Large',
  'Ideogram 3.0',
  'Ideogram 2.0',
  'GPT-5 Image (DALL-E 4)',
  'GPT-4o Image (DALL-E 3)',
  'Playground v3',
  'PONY Diffusion XL (v6)',
  'Illustrious XL',
  'Stable Diffusion XL',
  'Chroma v1',
  'Grok-3 Image (xAI)',
  'Grok-2 Image (xAI)',
  'HunYuan DiT v1.2',
  'Janus-V2 (DeepSeek)',
  'Janus-Pro (DeepSeek)',
  'Lumina-T2I',
  'WAN Image (T2I)',
  'Z-Image',
  'Default (General Purpose)',
]);

export const TARGET_VIDEO_AI_MODELS = sortModels([
  'LTX-3 (Narrative Video)',
  'Google Veo 3',
  'Google Veo 2',
  'Luma Ray (v3)',
  'Luma Ray (v2)',
  'Kling 2.0 Pro',
  'Kling 1.5 Pro',
  'Runway Gen-4 Alpha',
  'Runway Gen-3 Alpha Turbo',
  'Sora (OpenAI)',
  'Pika Art v3.0',
  'Pika Art v2.1',
  'Hailuo MiniMax-V2',
  'HunYuan Video v2',
  'Vidu 2.0',
  'WAN Video v2 (T2V)',
  'HiDream (Excellence)',
  'CogVideoX-5B',
  'Higgsfield (Alaya)',
  'Default (General Video)',
]);

export const TARGET_AUDIO_AI_MODELS = sortModels([
  'ElevenLabs v3 (TTS)',
  'MMAudio v2 (Sound FX)',
  'Vibe Voice',
  'Suno v4 (Music)',
  'Udio v2 (High-Fidelity)',
  'Stable Audio 3.0',
  'AudioLDM 2',
  'AudioBox (Meta)',
  'OpenAI Voice Engine',
  'Bark (Suno)',
  'Default (General Audio)',
]);

export const AVAILABLE_LLM_MODELS = [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Fastest)' },
    { id: 'gemini-3.5-pro', name: 'Gemini 3.5 Pro (Smarts)' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash-preview', name: 'Gemini 3.1 Flash' }
];