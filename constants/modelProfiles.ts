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
      mediaType: 'video',
      format: 'Temporal Narrative.',
      rules:
        'Describe sequence of action with physical verbs. Focus on physics-based motion, high temporal consistency, and realistic material deformation. Use natural language prose.',
    },
    {
      name: 'Veo',
      matchPatterns: ['veo'],
      mediaType: 'video',
      format: 'Cinematic Flow.',
      rules:
        'Describe lighting interactions, atmospheric density, and camera motion verbs. Focus on high-fidelity fluid action and cinematic color grading. Use evocative, descriptive prose.',
    },
    {
      name: 'Kling',
      matchPatterns: ['kling'],
      mediaType: 'video',
      format: 'Technical Cinematic Tags.',
      rules:
        'Mix natural language with technical lighting and physics descriptors. High detail on fluid dynamics, material properties, and complex human interactions.',
    },
    {
      name: 'Runway Gen',
      matchPatterns: ['runway'],
      mediaType: 'video',
      format: 'High-Impact Prose.',
      rules:
        'Direct, descriptive sentences focusing on material consistency, global illumination, and specific motion vectors. Avoid fluff; be visually precise.',
    },
    {
      name: 'Luma Dream Machine',
      matchPatterns: ['luma'],
      mediaType: 'video',
      format: 'Dynamic Keyframes.',
      rules:
        'Focus on the transition between the start and end of the motion. Highly descriptive of speed, direction changes, and dramatic camera shifts.',
    },
    {
      name: 'Sora',
      matchPatterns: ['sora'],
      mediaType: 'video',
      format: 'Hyper-Realistic Narrative.',
      rules:
        'Extremely detailed descriptions of complex scenes with multiple characters, specific types of motion, and precise background details. Focus on physical realism.',
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
      matchPatterns: ['hailuo', 'minimax'],
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
      matchPatterns: ['hidream'],
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
      format: 'Dense Descriptive Paragraph.',
      rules:
        'Natural language focusing on micro-textures, lighting interaction, and realistic material rendering. Describe the scene as if explaining it to a master painter. Avoid tag-lists. Mention \'hyper-realistic\' or \'raw\' if appropriate. Follow the STRICT IMAGE WORKFLOW for content structure.',
    },
    {
      name: 'Imagen',
      matchPatterns: ['imagen'],
      mediaType: 'image',
      format: 'Clear Semantic Prose.',
      rules:
        'High semantic accuracy. Describe relationships between objects and environmental lighting clearly. Focus on composition and clear subject-background separation. Follow the STRICT IMAGE WORKFLOW.',
    },
    {
      name: 'Midjourney',
      matchPatterns: ['midjourney'],
      mediaType: 'image',
      format: 'Stylized Aesthetic Tags.',
      rules:
        'Focus on style, medium, lighting mood, and artistic influence. Use evocative adjectives. Do NOT output params like --ar; they are handled via modifiers. Use latest style cues. Adapt the STRICT IMAGE WORKFLOW to this tag-based structure.',
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
      matchPatterns: ['gpt-', 'dall-e'],
      mediaType: 'image',
      format: 'Rich Narrative Prose.',
      rules:
        'Highly descriptive, imaginative, and literal. DALL-E follows instructions perfectly, so describe exactly what should be in the frame, including text if requested. Follow the STRICT IMAGE WORKFLOW.',
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
      format: 'Balanced Semantic Tags.',
      rules:
        'Focus on subject clarity and environmental context. Use a mix of natural language and descriptive keywords. Follow the STRICT IMAGE WORKFLOW.',
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
      format: 'Concise Visual Direction.',
      rules:
        'Short, direct descriptive phrases focusing on style, composition, and lighting. Avoid long narratives; prioritize visual keywords and clear aesthetic direction. Follow the STRICT IMAGE WORKFLOW.',
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
