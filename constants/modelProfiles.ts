/**
 * Model Profile Registry — versioned JSON schema replacing the hardcoded
 * `getModelSyntax()` function in llmService.ts.
 *
 * Each profile describes the syntax format and rules that an AI engine
 * (the LLM driving the prompt refiner) should use when crafting prompts
 * for a specific generative model architecture.
 *
 * To add a new model: add an entry to the `profiles` array with the model's
 * name, match patterns, format, rules, and media type. The match patterns
 * are checked case-insensitively against the target model name.
 */

export interface ModelProfile {
  /** Human-readable display name, e.g. "Flux", "Imagen", "Veo". */
  name: string;
  /**
   * One or more substrings to match against the (lowercased) model name.
   * The first profile whose any pattern matches wins.
   */
  matchPatterns: string[];
  /** The prompt format/style this architecture expects. */
  format: string;
  /** Detailed rules for writing prompts for this architecture. */
  rules: string;
  /** Primary media type this model produces. */
  mediaType: 'image' | 'video' | 'audio';
  /**
   * For audio models: the sub-mode(s) this profile applies to.
   * Empty for image/video models.
   */
  modes?: ('speech' | 'music' | 'sfx')[];
  /** Whether this model honors explicit token weights. Absent = false. */
  supportsTokenWeighting?: boolean;
  /** Weighting dialect. Only meaningful when supportsTokenWeighting is true. */
  weightSyntax?: "(token:weight)" | "((token))";
  /** Minimum valid weight value. */
  minWeight?: number;
  /** Maximum valid weight value. */
  maxWeight?: number;
  /** Step increment for weight adjustment. */
  weightStep?: number;
  /** Whether this model supports a separate negative prompt. */
  supportsNegativePrompt?: boolean;
  /**
   * Video "Director's Script" dialect. Absent = legacy motion rules.
   * timestamps: `0–3s:` beat lines · blocks: Cinematography/Actions blocks ·
   * paragraph: one flowing paragraph · prose: unlabeled beats in prose.
   */
  videoTimeline?: 'timestamps' | 'blocks' | 'paragraph' | 'prose';
  /** Discrete clip lengths in seconds (snap controls). */
  videoDurations?: number[];
  /** Continuous clip length range [min, max] in seconds. */
  videoDurationRange?: [number, number];
  /** Generates audio natively. Absent = unknown, false = silent. */
  videoAudio?: boolean;
  /** Lowercase name substrings of models in this profile that are silent despite videoAudio. */
  videoSilentModels?: string[];
}

export interface ModelProfileSchema {
  /** Schema version. Bump when making breaking changes. */
  version: number;
  /** Time of last update (ISO 8601). */
  updatedAt: string;
  profiles: ModelProfile[];
}

/**
 * The master list of all known model architecture profiles.
 * Ordered by media type (video → image → audio), then by
 * priority (more specific patterns first within each group).
 */
export const MODEL_PROFILES: ModelProfileSchema = {
  version: 1,
  updatedAt: '2026-07-25T00:00:00.000Z',
  profiles: [
    // ═══════════════════════════════════════════════════════════════════
    //  VIDEO ARCHITECTURES
    // ═══════════════════════════════════════════════════════════════════

    {
      name: 'LTX Video',
      matchPatterns: ['ltx'],
      // Official model card + vendor guide: one present-tense paragraph, audio generated
      videoTimeline: 'paragraph',
      videoAudio: true,
      mediaType: 'video',
      format: 'Temporal Narrative.',
      rules:
        'Describe sequence of action with physical verbs. Focus on physics-based motion, high temporal consistency, and realistic material deformation. Use natural language prose.',
    },
    {
      name: 'Veo',
      matchPatterns: ['veo'],
      // Official: ai.google.dev/gemini-api/docs/veo (no documented timestamp syntax)
      videoTimeline: 'prose',
      videoDurations: [4, 6, 8],
      videoAudio: true,
      videoSilentModels: ['veo 2'],
      mediaType: 'video',
      format: 'Cinematic Flow.',
      rules:
        'Describe lighting interactions, atmospheric density, and camera motion verbs. Focus on high-fidelity fluid action and cinematic color grading. Use evocative, descriptive prose.',
    },
    {
      name: 'Kling',
      matchPatterns: ['kling'],
      // Official (kling.ai Kling 3.0 user guide): 3–15 s, native audio, numbered "shot N," multi-shot.
      // Timestamped beats are the owner's format and community practice, not vendor syntax (tier-decide kept them, 0.60).
      videoTimeline: 'timestamps',
      videoDurationRange: [3, 15],
      videoAudio: true,
      mediaType: 'video',
      format: 'Technical Cinematic Tags.',
      rules:
        'Mix natural language with technical lighting and physics descriptors. High detail on fluid dynamics, material properties, and complex human interactions.',
    },
    {
      name: 'Runway Gen',
      matchPatterns: ['runway'],
      // Vendor help centre was unreachable (403); "short and direct, full sentences" is a search snippet only.
      videoTimeline: 'paragraph',
      mediaType: 'video',
      format: 'High-Impact Prose.',
      rules:
        'Direct, descriptive sentences focusing on material consistency, global illumination, and specific motion vectors. Avoid fluff; be visually precise.',
    },
    {
      name: 'Luma Dream Machine',
      matchPatterns: ['luma'],
      // Official: docs.agents.lumalabs.ai + Luma learning hub — ~100 words, positive only, 5 s / 10 s, no native audio
      videoTimeline: 'paragraph',
      videoDurations: [5, 10],
      videoAudio: false,
      mediaType: 'video',
      format: 'Dynamic Keyframes.',
      rules:
        'Focus on the transition between the start and end of the motion. Highly descriptive of speed, direction changes, and dramatic camera shifts.',
    },
    {
      name: 'Sora',
      matchPatterns: ['sora'],
      // Official: OpenAI Sora 2 prompting guide; length is the API `seconds` parameter
      videoTimeline: 'blocks',
      videoDurations: [4, 8, 12, 16, 20],
      videoAudio: true,
      mediaType: 'video',
      format: 'Hyper-Realistic Narrative.',
      rules:
        'Extremely detailed descriptions of complex scenes with multiple characters, specific types of motion, and precise background details. Focus on physical realism.',
    },
    {
      name: 'Wan 2.x',
      // 'wan 2' covers WAN 2.5 / 2.7; 'WAN Image (T2I)' stays unmatched
      matchPatterns: ['wan 2'],
      // Official: alibabacloud.com Model Studio text-to-video reference. wan2.7 documents
      // "Shot 1 [0–3 seconds] ..." and 2–15 s; wan2.5 is 5 or 10 s only (snapped by the range here).
      videoTimeline: 'timestamps',
      videoDurationRange: [2, 15],
      videoAudio: true,
      mediaType: 'video',
      format: 'Dense Visual Script.',
      rules:
        'Describe the scene with a focus on spatial relationships, character expressions, and environmental changes over time. High emphasis on consistent character features. Keep the main subject wording identical across shots.',
    },
    {
      name: 'Wan / Hunyuan Video',
      matchPatterns: ['wan video', 'hunyuan video'],
      mediaType: 'video',
      format: 'Dense Visual Script.',
      rules:
        'Describe the scene with a focus on spatial relationships, character expressions, and environmental changes over time. High emphasis on consistent character features.',
    },
    {
      name: 'Pika',
      matchPatterns: ['pika'],
      mediaType: 'video',
      format: 'Concise Action Prose.',
      rules:
        'Short, punchy sentences: one clear subject, one primary action, strong style keywords. Avoid multi-event sequences; describe a single continuous motion with a distinct visual style.',
    },
    {
      name: 'Hailuo / MiniMax',
      matchPatterns: ['hailuo'],
      // Official: platform.minimax.io (audio output not stated)
      videoTimeline: 'prose',
      mediaType: 'video',
      format: 'Directorial Shot Description.',
      rules:
        'Subject + scene + action + camera language. Camera moves may be given as bracketed director commands, e.g. [Pan left], [Zoom in], [Tracking shot], placed at the point in the action where they occur.',
    },
    {
      name: 'Vidu',
      matchPatterns: ['vidu'],
      mediaType: 'video',
      format: 'Dynamic Scene Prose.',
      rules:
        'Prioritize subject consistency and animation strength: clear subject identity, then environment, then a well-defined motion arc. Avoid ambiguous pronouns; restate the subject.',
    },
    {
      name: 'CogVideo',
      matchPatterns: ['cogvideo'],
      mediaType: 'video',
      format: 'Detailed Narrative Paragraph.',
      rules:
        'Verbose, caption-style prose: exhaustively describe subject appearance, environment, and the full motion sequence in flowing sentences. This architecture rewards long, dense descriptions.',
    },
    {
      name: 'HiDream',
      matchPatterns: ['hidream (', 'hidream video'],
      mediaType: 'video',
      format: 'High-Fidelity Scene Prose.',
      rules:
        'Natural language with strong emphasis on aesthetic quality: lighting mood, color harmony, and clean composition, followed by a simple, physically plausible motion.',
    },
    {
      name: 'Higgsfield',
      matchPatterns: ['higgsfield'],
      mediaType: 'video',
      format: 'Camera-Motion Centric Shot.',
      rules:
        'Lead with the camera move (crash zoom, orbit, dolly, FPV dive, bullet-time) and build the scene around it. Bold, dramatic cinematography verbs; one signature move per prompt.',
    },
    {
      name: 'Seedance',
      matchPatterns: ['seedance'],
      // Seedance 2.0: vendor launch post confirms 15 s multi-shot with audio; prompt syntax unverified
      // (Seedance 2.5 doc shows "0–X seconds:"), so timestamps stay as the owner's format.
      videoTimeline: 'timestamps',
      videoDurationRange: [2, 15],
      videoAudio: true,
      mediaType: 'video',
      format: 'Dynamic Cinematic Shot.',
      rules:
        'Fluid motion with strong temporal coherence. Describe the scene as a continuous unfolding moment with precise lighting transitions and physics-consistent movement. Leverage multi-modal input: describe character reactions, camera paths, and environmental physics.',
    },
    {
      name: 'Mochi',
      matchPatterns: ['mochi'],
      mediaType: 'video',
      format: 'Open-Domain Motion Script.',
      rules:
        'General-purpose video description with strong subject consistency. Describe character actions, environment changes, and camera movement in flowing prose paragraphs.',
    },
    {
      name: 'HappyHorse',
      matchPatterns: ['happyhorse'],
      mediaType: 'video',
      format: 'Multi-Style Cinematic Prose.',
      rules:
        'Versatile scene description that adapts to any visual style. Focus on dynamic composition, rich color language, and physically coherent motion. High emphasis on atmosphere and emotional tone.',
    },
    {
      name: 'SkyReels',
      matchPatterns: ['skyreels'],
      mediaType: 'video',
      format: 'Structured Scene Narrative.',
      rules:
        'Detailed subject-first description with strong temporal continuity. Establish character, environment, and action arc in flowing prose. Focus on 1080p fidelity and consistent physics across the full clip.',
    },
    {
      name: 'PixVerse',
      matchPatterns: ['pixverse'],
      mediaType: 'video',
      format: 'Stylized Visual Scene.',
      rules:
        'Creative visual descriptions with emphasis on artistic style and aesthetic quality. Blend narrative prose with specific visual references and mood cues.',
    },

    // ═══════════════════════════════════════════════════════════════════
    //  IMAGE ARCHITECTURES
    // ═══════════════════════════════════════════════════════════════════

    {
      name: 'Flux',
      matchPatterns: ['flux'],
      mediaType: 'image',
      format: 'Natural Language Narrative.',
      rules:
        "Write the scene as flowing natural-language prose in this order: subject, action or pose, style or medium, setting, lighting, camera details. Be concrete (age, hair, clothing, materials) instead of generic. FLUX has no negative prompt and no weight syntax: state what you want, never what to avoid, and no keyword stacks or (token:1.2) markup. Put any text to render in double quotes. Follow the STRICT IMAGE WORKFLOW for content structure.",
    },
    {
      name: 'Imagen',
      matchPatterns: ['imagen'],
      mediaType: 'image',
      format: 'Descriptive Natural Language.',
      rules:
        "Follow Google's prompt guide: name the subject first, then its context or setting, then the style (photograph, sketch, pastel painting, isometric 3D). Use descriptive adjectives and adverbs in full sentences. For a photograph open with 'A photo of' and add camera proximity, camera position, lighting, lens (for example 24-35mm for portraits, 60-105mm macro for objects) and film type as needed. Keep any text to render short (about 25 characters, two or three phrases at most), in quotes, with a general font style. Never use 'no' or 'don't' phrasing. Follow the STRICT IMAGE WORKFLOW.",
    },
    {
      name: 'Midjourney',
      matchPatterns: ['midjourney'],
      mediaType: 'image',
      format: 'Natural Language Description.',
      rules:
        "Write one or two vivid, specific descriptive sentences in natural language (subject, setting, lighting, medium and style) instead of stacked keywords or comma-separated tags; put the most important elements first. Do NOT output params like --ar, --v or --style; they are handled via modifiers. Adapt the STRICT IMAGE WORKFLOW to a compact descriptive sentence.",
    },
    {
      name: 'Stable Diffusion 3+',
      matchPatterns: ['stable diffusion 3', 'stable diffusion 4', 'sd3'],
      mediaType: 'image',
      format: 'Natural Language Description.',
      rules:
        "Follow Stability AI's SD 3.5 guidance: describe the idea in plain, complete sentences like briefing a creative partner. Cover subject, style, composition terms (close-up, wide-angle) and lighting. Put any text to render in double quotes and keep it short. Do not use weight syntax or quality-tag spam (no 'masterpiece, 8k'). Follow the STRICT IMAGE WORKFLOW.",
      supportsNegativePrompt: true,
    },
    {
      name: 'Stable Diffusion / SDXL',
      matchPatterns: ['stable diffusion', 'sdxl'],
      mediaType: 'image',
      format: 'Structured Descriptive Tags.',
      rules:
        'Mix of descriptive phrases and specific keywords. Focus on lighting (e.g., \'volumetric lighting\'), quality (e.g., \'highly detailed\'), and style (e.g., \'digital art\'). Follow the STRICT IMAGE WORKFLOW.',
      supportsTokenWeighting: true,
      weightSyntax: "(token:weight)",
      minWeight: 0.1,
      maxWeight: 2.0,
      weightStep: 0.05,
    },
    {
      name: 'Pony / Illustrious',
      matchPatterns: ['pony', 'illustrious'],
      mediaType: 'image',
      format: 'Weighted Tags.',
      rules:
        'Start with quality scores (score_9, score_8_up, etc). Use descriptive tags for subjects, specific stylistic triggers, and Danbooru-style tagging conventions. Follow the STRICT IMAGE WORKFLOW.',
      supportsTokenWeighting: true,
      weightSyntax: "(token:weight)",
      minWeight: 0.1,
      maxWeight: 2.0,
      weightStep: 0.05,
    },
    {
      name: 'A1111 / Forge',
      matchPatterns: ['a1111', 'forge'],
      mediaType: 'image',
      format: 'Structured Descriptive Tags.',
      rules:
        'Mix of descriptive phrases and specific keywords. Focus on lighting, quality, and style. Supports weighted tokens via the (token:weight) syntax. Follow the STRICT IMAGE WORKFLOW.',
      supportsTokenWeighting: true,
      weightSyntax: "(token:weight)",
      minWeight: 0.1,
      maxWeight: 2.0,
      weightStep: 0.05,
    },
    {
      name: 'GPT / DALL-E',
      matchPatterns: ['gpt-', 'gpt image', 'dall-e'],
      mediaType: 'image',
      format: 'Structured Natural Language Narrative.',
      rules:
        "Follow OpenAI's image prompting guide: order the prompt scene or background first, then the subject, then key details (materials, colours, composition, lighting), then constraints. Name the intended use (ad, UI mockup, infographic) when it is known. Be literal and exact about what is in the frame and where. Put text to render in double quotes with font style, size, colour and placement. State exclusions and invariants explicitly (for example 'no extra text', 'no watermark'). For photorealism say 'photorealistic' or 'real photograph'. Follow the STRICT IMAGE WORKFLOW.",
    },
    {
      name: 'Ideogram',
      matchPatterns: ['ideogram'],
      mediaType: 'image',
      format: 'Graphic Design Focus.',
      rules:
        'Focus on typography, layout, and clean graphic elements. Describe text placement and font styles clearly if applicable. Follow the STRICT IMAGE WORKFLOW.',
    },
    {
      name: 'Janus / DeepSeek',
      matchPatterns: ['janus', 'deepseek'],
      mediaType: 'image',
      format: 'Natural Language Description.',
      rules:
        "Write clear, complete natural-language sentences: subject clarity first, then environment, lighting and style. Avoid keyword stacks and weight markup. Follow the STRICT IMAGE WORKFLOW.",
    },
    {
      name: 'Seedream',
      matchPatterns: ['seedream'],
      mediaType: 'image',
      format: 'Aesthetic Detail Prose.',
      rules:
        'Prioritize aesthetic quality: lighting mood, color harmony, material textures, and elegant composition. Write flowing descriptive paragraphs with strong artistic direction. Follow the STRICT IMAGE WORKFLOW.',
    },
    {
      name: 'Qwen-Image',
      matchPatterns: ['qwen-image', 'qwen_image'],
      mediaType: 'image',
      format: 'Balanced Descriptive Prose.',
      rules:
        'Clear subject-focused description with strong emphasis on visual relationships: foreground subject, midground action, background environment. Use natural language with precise spatial terms. Follow the STRICT IMAGE WORKFLOW.',
    },
    {
      name: 'Nano Banana',
      matchPatterns: ['nano banana', 'nano_banana'],
      mediaType: 'image',
      format: 'Descriptive Scene Narrative.',
      rules:
        "Describe the scene in natural, narrative sentences rather than a keyword list: who or what is in it, what they are doing, the setting, the lighting and mood, the camera angle and composition. Be specific about materials and details. For edits state what changes and what must stay the same. Put any text to render in double quotes. Follow the STRICT IMAGE WORKFLOW.",
    },
    {
      name: 'Recraft',
      matchPatterns: ['recraft'],
      mediaType: 'image',
      format: 'Vector-Ready Graphic Description.',
      rules:
        'Geometric precision, scalable shapes, and consistent style. Describe flat colors, typography, and layout composition with exact spatial relationships. Follow the STRICT IMAGE WORKFLOW.',
    },
    {
      name: 'Lumina',
      matchPatterns: ['lumina'],
      mediaType: 'image',
      format: 'Atmospheric Scene Description.',
      rules:
        'Focus on lighting, color palette, and mood. Use rich descriptive language emphasizing shadows, highlights, and atmospheric effects as primary elements. Follow the STRICT IMAGE WORKFLOW.',
},    {      name: 'Leonardo',      matchPatterns: ['leonardo'],      mediaType: 'image',      format: 'Cinematic Scene Description.',      rules:        'Photorealistic focus with cinematic framing. Describe camera lens, depth of field, lighting setup, and subject positioning with precision. Use film-industry terminology. Follow the STRICT IMAGE WORKFLOW.',    },    {      name: 'Playground',      matchPatterns: ['playground'],      mediaType: 'image',      format: 'Artistic Style Description.',      rules:        'Emphasize artistic style and visual aesthetic over photorealism. Reference art movements, color theories, and compositional techniques. Be expressive and creative with visual metaphors. Follow the STRICT IMAGE WORKFLOW.',    },    {      name: 'Flux Pro',      matchPatterns: ['flux pro', 'flux-dev'],      mediaType: 'image',      format: 'Natural Language Description.',      rules:        'Write in plain, natural sentences. Flux understands conversational descriptions well. Avoid excessive comma-separated tags. Describe the scene as you would explain it to a skilled photographer. Follow the STRICT IMAGE WORKFLOW.',
    },

    // ═══════════════════════════════════════════════════════════════════
    //  AUDIO ARCHITECTURES
    // ═══════════════════════════════════════════════════════════════════

    {
      name: 'ElevenLabs',
      matchPatterns: ['elevenlabs'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Dialogue Script.',
      rules:
        'Embed inline audio tags for delivery: [whispers], [laughs], [sighs], [excited], [sarcastic], [pause]. Punctuation drives pacing (ellipses for hesitation, CAPS for emphasis). Focus on cadence and character-specific vocal quirks.',
    },
    {
      name: 'Bark',
      matchPatterns: ['bark'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Expressive Script.',
      rules:
        'Plain script text with nonverbal cues in brackets: [laughter], [sighs], [gasps], [clears throat], and ♪ around sung lines. Keep sentences short; hesitation via \'...\' reads naturally.',
    },
    {
      name: 'Vibe Voice',
      matchPatterns: ['vibe voice'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Conversational Script.',
      rules:
        'Long-form multi-speaker dialogue with explicit speaker labels (Speaker 1:, Speaker 2:). Natural conversational rhythm, turn-taking, and consistent per-speaker tone descriptions.',
    },
    {
      name: 'Voice Engine / OpenAI Voice',
      matchPatterns: ['voice engine', 'openai voice'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Voice Direction Script.',
      rules:
        'The script text plus concise delivery direction: emotion, pacing, accent, and energy level stated up front, then the verbatim lines to speak.',
    },
    {
      name: 'Suno / Udio',
      matchPatterns: ['suno', 'udio'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Musical Structure.',
      rules:
        'Define [Genre], [Instruments], [Mood], [Tempo], and structure (Verse, Chorus, Bridge, Drop). Use descriptive musical terms and production style cues. NEVER name real artists; describe their style traits instead.',
    },
    {
      name: 'Stable Audio',
      matchPatterns: ['stable audio'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Structured Sound Descriptors.',
      rules:
        'Comma-separated descriptor fields: Genre, Subgenre, Instruments, Moods, BPM, Key, production style (e.g. \'Trip Hop, Dusty Drums, Rhodes, Moody, 90 BPM, D minor\'). Concrete sonic vocabulary over narrative prose.',
    },
    {
      name: 'AudioLDM',
      matchPatterns: ['audioldm'],
      mediaType: 'audio',
      modes: ['sfx'],
      format: 'Concise Sound Event Description.',
      rules:
        'One clear sentence per sound event: source, action, and acoustic environment (e.g. \'a wooden door creaks open slowly in an empty stone hallway\'). Avoid abstract or visual-only adjectives.',
    },
    {
      name: 'AudioBox',
      matchPatterns: ['audiobox'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Natural Sound Narration.',
      rules:
        'Plain-language description of the sound scene or voice qualities: who/what is producing sound, where, and how it evolves. Combine voice description with environmental context when both apply.',
    },
    {
      name: 'MMAudio',
      matchPatterns: ['mmaudio'],
      mediaType: 'audio',
      modes: ['sfx'],
      format: 'Layered Sonic Textures.',
      rules:
        'Describe the layers of sound, material impact, and acoustic environment (reverb, echo, spatial positioning). Focus on foley-style detail.',
    },
    {
      name: 'Kokoro',
      matchPatterns: ['kokoro'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Natural Speech Script.',
      rules:
        'Conversational text with natural rhythm. Punctuation drives pacing: commas for brief pauses, periods for stops, ellipses for hesitation. No special tags needed.',
    },
    {
      name: 'Fish Audio',
      matchPatterns: ['fish audio'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Character Voice Script.',
      rules:
        'Explicit speaker labels with delivery cues. Use inline tags for emotion [happy], [sad], [angry], [whisper], [shout]. Clear pause and emphasis markers.',
    },
    {
      name: 'MiniMax Music',
      matchPatterns: ['minimax music'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Vocal-First Musical Structure.',
      rules:
        'Prioritize vocal description: emotional delivery, vocal timbre, vibrato, and lyrical phrasing. Then define genre, tempo, instruments, and arrangement. Write structured tags: [Genre], [Vocal Style], [Instrumentation], [Mood]. Focus on natural-sounding vocal performance with realistic breath control.',
    },
    {
      name: 'MiniMax Speech',
      matchPatterns: ['minimax speech'],
      mediaType: 'audio',
      modes: ['speech'],
      format: 'Expressive Dialogue Prose.',
      rules:
        'Rich emotional context cues embedded in natural prose. Describe the delivery style before the dialogue line: \'In a hushed, urgent tone: [...]\'.',
    },
    {
      name: 'Mureka',
      matchPatterns: ['mureka'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Lyrics-First Musical Structure.',
      rules:
        'Start with the lyrics/theme, then define the instrumental arrangement around them. Use structured tags: [Genre], [Mood], [Vocal Style], [Instrumentation], [Tempo]. Write lyrics with clear section markers: [Verse], [Chorus], [Bridge]. Match the musical arrangement to the emotional arc of the lyrics.',
    },
    {
      name: 'Lyria',
      matchPatterns: ['lyria'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Musical Genre & Texture.',
      rules:
        'Define genre, instrumentation, texture, and production style. Use descriptive musical language: \'lush pads\', \'driving 808s\', \'airy vocal harmonies\', \'lo-fi tape warmth\'. Multi-language support available; specify language explicitly.',
    },
    {
      name: 'Ace-Step',
      matchPatterns: ['ace-step'],
      mediaType: 'audio',
      modes: ['music'],
      format: 'Structured Music Tags.',
      rules:
        'Comma-separated musical descriptors: genre, tempo (BPM), key, instruments, mood, production references. Keep concise; structure before lyrics.',
    },
  ],
};

/**
 * Look up the best-matching model profile for a given model name.
 * Falls back to a generic profile based on media type.
 */
export function lookupModelProfile(
  model: string,
  isVideo?: boolean,
  isAudio?: boolean
): ModelProfile {
  const lower = model.toLowerCase();

  for (const p of MODEL_PROFILES.profiles) {
    for (const pattern of p.matchPatterns) {
      if (lower.includes(pattern)) {
        return p;
      }
    }
  }

  // Media-aware fallbacks
  const fallbackName = isVideo ? 'Generic Video' : isAudio ? 'Generic Audio' : 'Generic Image';
  return {
    name: fallbackName,
    matchPatterns: [],
    mediaType: isVideo ? 'video' : isAudio ? 'audio' : 'image',
    format: isVideo
      ? 'Cinematic Motion Prose.'
      : isAudio
        ? 'Structured Audio Description.'
        : 'Natural Language.',
    rules: isVideo
      ? 'One continuous shot: subject, scene, action, camera movement, lighting, and style in flowing prose. Concrete motion verbs and physically plausible dynamics.'
      : isAudio
        ? 'Describe sound sources, acoustic space, mood, and rhythm with precise sonic vocabulary. No visual-only language.'
        : 'Cohesive visual or conceptual description with high attention to detail and unique stylistic flair.',
    supportsTokenWeighting: false,
  };
}

/**
 * Serialize a modifier token with model-appropriate weighting syntax.
 * For models that don't support weighting (Flux, Imagen, etc.), returns
 * the raw token unchanged. For (token:weight) syntax models (SD, SDXL,
 * Pony, Illustrious, A1111/Forge), emits (token:1.30). For ((token))
 * syntax models, repeats parens proportionally. Tokens at weight 1.0
 * are always returned plain.
 */
export function serializeModifierToken(
  token: string,
  weight: number,
  targetModel: string,
): string {
  const profile = lookupModelProfile(targetModel);
  if (!profile.supportsTokenWeighting || weight === 1.0) return token;

  if (profile.weightSyntax === "(token:weight)") {
    return `(${token}:${weight.toFixed(2)})`;
  }
  if (profile.weightSyntax === "((token))") {
    const count = Math.round((weight - 1.0) / 0.1);
    if (count > 0) return "(".repeat(count) + token + ")".repeat(count);
    if (count < 0) return "[".repeat(-count) + token + "]".repeat(-count);
  }
  return token;
}
