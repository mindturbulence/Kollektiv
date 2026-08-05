
import type { EnhancementResult, LLMSettings, PromptModifiers } from '../types';
import { translateToEnglishGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, suggestTagsRawGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream, generateConstructorPresetGemini } from './geminiService';
import { analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, suggestTagsRawOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { refineSinglePromptLlamaCpp, enhancePromptLlamaCppStream, refineSinglePromptLlamaCppStream, reconstructFromIntentLlamaCpp } from './llamacppService';
import { TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';
import { lookupModelProfile, serializeModifierToken } from '../constants/modelProfiles';
import { withProviderFallback } from './providerFallback';
import { appEventBus } from '../utils/eventBus';

export type LLMProvider = 'gemini' | 'ollama' | 'llamacpp' | 'anthropic' | 'openrouter';

export const getActiveProvider = (settings: LLMSettings): LLMProvider => {
    switch (settings.activeLLM) {
        case 'ollama':
        case 'ollama_cloud': return 'ollama';
        case 'llamacpp': return 'llamacpp';
        case 'anthropic': return 'anthropic';
        case 'openrouter': return 'openrouter';
        default: return 'gemini';
    }
};

export class ProviderUnsupportedError extends Error {
    constructor(feature: string, provider: LLMProvider, supported: LLMProvider[]) {
        super(`${feature} is not available with the ${provider} engine (supported: ${supported.join(', ')}). Switch the AI Engine in Settings > Integrations.`);
        this.name = 'ProviderUnsupportedError';
    }
}

const requireProvider = (feature: string, settings: LLMSettings, supported: LLMProvider[]): LLMProvider => {
    const provider = getActiveProvider(settings);
    if (!supported.includes(provider)) throw new ProviderUnsupportedError(feature, provider, supported);
    return provider;
};

// --- Audio Mode Detection (speech vs music vs sfx changes the whole prompt shape) ---
const getAudioMode = (model: string): 'speech' | 'music' | 'sfx' => {
    const lower = model.toLowerCase();
    // Music models must be checked before generic speech matches
    if (/(elevenlabs.*music|music v2|suno|udio|stable audio|ace-step|lyria|mureka|minimax.*music)/.test(lower)) return 'music';
    if (/(elevenlabs|voice|tts|bark|speech|kokoro|fish audio|minimax.*speech)/.test(lower)) return 'speech';
    if (/(mmaudio|sound fx|sfx|audioldm|audiobox|foley)/.test(lower)) return 'sfx';
    return 'music';
};

// --- Model-Specific Syntax (Engine Tuning) — extracted to constants/modelProfiles.ts ---
const getModelSyntax = (model: string, isVideo: boolean = false, isAudio: boolean = false) => {
    return lookupModelProfile(model, isVideo, isAudio);
};

// --- AI Roles (Persona System) ---
const IMAGE_GENERATION_WORKFLOW = `
STRICT IMAGE WORKFLOW:
1. LOCK CORE ELEMENTS: Accurately identify and preserve non-negotiable components from the user input, including subject, count, action, state, named IP/character, key colors, and any specified text.
2. CLASSIFY TASK TYPE:
   - For DIRECT GENERATION (e.g., "draw a..."): Enhance the original intent with professional visual details: composition (centered, rule of thirds), lighting (backlit, softbox), materials (matte ceramic, reflective metal), color palette (pastel, neon high-contrast), and spatial depth (foreground/midground/background).
   - For IMAGE EDITING (e.g., "add/replace/change..."): Apply editing logic: supplement minimal but sufficient attributes (category, color, size, orientation, position) for new objects; for humans, modify only the specified feature while preserving core identity (ethnicity, gender, hairstyle, expression, outfit); for style transfer, distill key visual traits (e.g., "1970s disco: disco ball, mirrored walls, strobe lights, vibrant palette"); for background changes, prioritize subject consistency.
   - For GENERATIVE REASONING TASKS (e.g., "design a poster", "illustrate a solution"): First construct a complete, plausible, and visually coherent concept, then describe it.
3. HANDLE TEXT WITH PRECISION:
   - Only include text if explicitly requested in the base prompt. Do NOT infer or add decorative text (e.g., labels, signs, watermarks) unless the user specifically asks for it.
   - All requested text must be reproduced EXACTLY and enclosed in English double quotes (e.g., "SALE 50% OFF").
   - Specify text location (e.g., "top center", "bottom-right corner"), font style (e.g., "bold sans-serif", "handwritten script"), color, and physical medium (e.g., "neon sign", "chalkboard", "LCD screen").
   - For text replacement, use fixed phrasing: Replace "original" to "new" or Replace the [region] bounding box to "new".
   - Never include the camera/drone/light device itself, studio lights or stands, camera body, propellers, or quadcopter body within the frame, nor any text or camera model names referencing specific drone brands like DJI in your output. Use positive constraints to describe the aesthetic produced from the camera/drone/lighting like 'birds-eye view,' 'high-altitude aerial,' 'top-down perspective,' or 'soft studio illumination,' to ensure the model focuses on the visual style and angle rather than rendering the hardware.
4. ENFORCE LOGICAL CONSISTENCY: Resolve ambiguities, contradictions, or unfeasible requests; infer missing details (e.g., default placement in visually balanced areas); ensure new elements align with scene logic and style.
5. DEEP ENVIRONMENTAL ENRICHMENT: Always expand simplistic style commands or sparse subjects into rich multi-layered parameters:
   - Cinematic Composition: Mandate volumetric lighting, exact shot types (e.g., master shot, extreme close-up), high depth-of-field separation, or meticulous lens reflections.
   - Color Theory and Palette Limits: Prescribe strict harmony schemes (e.g., complementary cyan-orange color grading, split-complementary warm tones, monochromatic slate scales).
   - Render & Environmental Quality: Include native descriptions of physically based materials (PBR Shaders), Raytraced reflections, light scatter, lens aberrations, and atmospheric elements like volumetric fog or floating dust particles.

FINAL OUTPUT CONSTRAINTS:
- Be in English.
- Be objective, concrete, and free of metaphors or emotional language.
- Exclude meta-tags like "8K", "masterpiece", or "ultra-detailed".
- CONTAIN ONLY THE FINAL PROMPT—NO EXPLANATIONS, TITLES, OR FORMATTING.
`;

// Shared by ENHANCER and REFINER. Video models read plain prose — literal
// "Keyframe 2s" labels leak into the output prompt and hurt adherence.
const VIDEO_MOTION_RULES = `
[MOTION TIMELINE RULES]: Write the motion as ONE continuous chronological arc in prose: (1) establish the opening framing and the subject's initial state, (2) develop the primary action to its dynamic peak — speed changes, momentum shifts, weight and gravity, (3) resolve with the action's culmination or a camera settle. Connect the beats with natural flow words ("as", "then", "while"), NEVER with labels. STRICTLY FORBIDDEN in the output: timestamps, "Keyframe" markers, section headers, or shot lists. Every described motion must be physically plausible and achievable within a single short clip — one primary action, not a montage.`;

const AUDIO_STRUCTURE_RULES: Record<'speech' | 'music' | 'sfx', string> = {
    speech: `
[SPEECH SCRIPT RULES]: Output a performable script. Embed delivery cues inline in brackets exactly where they occur: [whispers], [sighs], [laughs], [pause], [excited], [breath]. Use punctuation for pacing (ellipses for hesitation, em-dashes for interruption, CAPS sparingly for emphasis). Describe the voice once up front (age, timbre, accent, emotional register), then give the verbatim lines. NO music headers, BPM, or [Verse]/[Chorus] tags.`,
    music: `
[MUSIC STRUCTURE RULES]: Define the sonic identity with structured tags: [Genre: <style>] [Tempo: <BPM>] [Mood: <emotion>] [Instruments: <list>], then the song structure where lyrics apply: [Intro] [Verse] [Chorus] [Bridge] [Drop] [Outro]. Include production style cues (analog warmth, sidechain compression, lo-fi tape hiss). NEVER name real artists or bands — describe their sonic traits instead.`,
    sfx: `
[SOUND DESIGN RULES]: Describe the sound event in concrete physical layers: the source and its material (wood, metal, glass, flesh), the action producing the sound (impact, scrape, whoosh), the acoustic space (room size, reverb tail, echo), and spatial position/movement (close-up, panning left, receding). Order the layers foreground to background. NO song structure, lyrics, BPM, or genre tags.`,
};

const AUDIO_MODE_PROTOCOLS: Record<'speech' | 'music' | 'sfx', string> = {
    speech: "Vocal performance focus. Prioritize emotional delivery, cadence, and character consistency over ambient description.",
    music: "Musical composition focus. Prioritize instrumentation, arrangement, production quality, and structural complexity.",
    sfx: "Sound design focus. Prioritize physical accuracy of sources, materials, and acoustic space. Foley-level precision.",
};

const AI_ROLES = {
    ENHANCER: (model: string, length: string, isVideo: boolean, isAudio: boolean, _hasManualCamera: boolean, inputType?: string, modifierCatalog?: string, masterRole?: string) => {
        const syntax = getModelSyntax(model, isVideo, isAudio);
        const l = length === 'Short' ? 'Strictly under 40 words' : length === 'Long' ? 'EXTREMELY DETAILED, at least 4-5 long paragraphs (minimum 600 words)' : 'Around 150-200 words';
        const isI2V = isVideo && inputType === 'i2v';

        let persona = masterRole ? `Master Role: ${masterRole}\n\nTask Specific Role: World-Class Visual Strategist and Prompt Architect.` : "Role: World-Class Visual Strategist and Prompt Architect.";
        let modeProtocol = "Focus on unique, high-fidelity textures, atmospheric depth, and sophisticated storytelling. CRITICAL: Camera specifications (Body/Model) are technical metadata for the capture device. Do NOT describe a person holding the camera or the camera appearing in the scene.";

        let temporalInstruct = "";
        if (isVideo) {
            temporalInstruct = VIDEO_MOTION_RULES;
            persona = masterRole ? `Master Role: ${masterRole}\n\nTask Specific Role: Visionary Cinematic Director.` : "Role: Visionary Cinematic Director.";
            if (isI2V) {
                modeProtocol = `I2V PROTOCOL (DIRECTING AN IMAGE): The user is providing a reference image. Assume the subject, colors, and static details are already set. DO NOT describe colors or objects in the image. Focus EXCLUSIVELY on directing movement, camera paths, and temporal shifts. Strip all static adjectives. Output must be purely kinetic, efficient, and physically plausible.`;
            } else {
                modeProtocol = `T2V PROTOCOL (WORLD BUILDING): Build a cinematic world from scratch. Focus on composition, blocking, character action, and lighting that establishes a powerful narrative scene.`;
            }
        } else if (isAudio) {
            const audioMode = getAudioMode(model);
            temporalInstruct = AUDIO_STRUCTURE_RULES[audioMode];
            persona = masterRole ? `Master Role: ${masterRole}\n\nTask Specific Role: Master Audio Producer and Sound Architect.` : "Role: Master Audio Producer and Sound Architect.";
            modeProtocol = AUDIO_MODE_PROTOCOLS[audioMode];
        } else {
            modeProtocol += ` IMAGE PROTOCOL: This is for a STATIC image. Do NOT include temporal descriptions, durations, or motion verbs unless they describe a frozen moment in time. Focus on 'the decisive moment'. ${IMAGE_GENERATION_WORKFLOW}`;
        }

        const spatialInstruct = isAudio ? '' : `\n[SPATIAL GEOMETRY & MESH DESCRIPTORS]: If the input describes geometric, 3D, architecture, CAD, or spatial layouts, explicitly refer to native XYZ coordinate grids, surface extrusion normals, wireframe vertices, depth topologies, and mesh structures (e.g., 'oriented at coordinate node [X, Y, Z]', 'triangular tessellation boundary curves', or 'extruded normal vectors').`;

        return `${persona}
Goal: Generate 1 highly accurate, production-ready refined prompt.
Target Architecture: ${model}.
Syntax: ${syntax.format}. Rules: ${syntax.rules}. Target Len: ${l} (CRITICAL: YOU MUST STRICTLY FOLLOW THIS LENGTH CONSTRAINT).
${modeProtocol}
${temporalInstruct}
${spatialInstruct}

BREAKDOWN PROTOCOL:
At the end of your response, after a "---PROMPT_BREAKDOWN---" separator, provide a JSON object breaking down the prompt's anatomy.
${modifierCatalog ? `[AVAILABLE MODIFIERS CATALOG]
${modifierCatalog}

STRICT BREAKDOWN RULE:
1. You MUST lookup the [AVAILABLE MODIFIERS CATALOG] first.
2. If the refined prompt contains a value matching a value in the catalog (e.g., "Studio Lighting"), you MUST use the corresponding category (e.g., "lighting") as the JSON key and the exact value from the catalog as the JSON value.
3. If the prompt contains sensory or technical details similar or linked to a catalog parameter, COMBINE them into that category (e.g., if you have "dim light" and "Studio Lighting", use "Lighting": "Studio Lighting, dim light").
4. SELECTIVE OUTPUT: ONLY include keys for which there is EXPLICIT, non-default information present in the refined prompt. 
5. NO HALLUCINATION: DO NOT include keys for categories that are not clearly represented in the text. (e.g., if there is no mention of orientation, size, or ratio, the "aspectRatio" key MUST be omitted).
6. NO DEFAULTS: Zero-value, placeholder, or 'default' keys/values are Strictly Forbidden.
7. ARCHITECTURE RELEVANCE: DO NOT include parameters specific to models other than ${model}. (e.g., if ${model} is not Midjourney, NEVER include "mjVersion" or "mjAspectRatio").
8. Minimum required keys: "subject". All others are ONLY included if explicitly present in the generated prompt.` : `
- ONLY include parameters EXPLICITLY present in the prompt. 
- ALWAYS include "subject". Omit everything else if not specifically mentioned.`}
- Ensure the JSON is well-formatted and valid.
- CRITICAL: DO NOT include the full "refined prompt" string as a key/value inside this JSON object. Only include the analytical components.

CRITICAL: Even for short inputs, expand with creative, model-specific details that maximize the output quality of ${model}. Be unique, avoid generic descriptions.
Output: The refined prompt text first, then the separator, then the JSON breakdown.
NO INTROS, NO EXPLANATIONS.`;
    },

    REFINER: (model: string, isVideo: boolean, isAudio: boolean, _hasManualCamera: boolean, inputType?: string, masterRole?: string) => {
        const syntax = getModelSyntax(model, isVideo, isAudio);
        const isI2V = isVideo && inputType === 'i2v';

        let protocol = "";
        let role = masterRole ? `Master Role: ${masterRole}\nTask Role: Elite Prompt Refiner and Model Specialist.` : "Elite Prompt Refiner and Model Specialist.";
        let temporalInstruct = "";

        if (isVideo) {
            temporalInstruct = VIDEO_MOTION_RULES;
            role = masterRole ? `Master Role: ${masterRole}\nTask Role: Visionary Cinematic Director.` : "Visionary Cinematic Director.";
            if (isI2V) {
                protocol = "I2V PROTOCOL: You are animating a fixed image. Strip all static descriptions of the subject. Focus ONLY on the physics of motion, camera pathing, and scene evolution.";
            } else {
                protocol = "T2V PROTOCOL: Direct the scene from text. Establish subject, environment, and motion sequence with cinematic precision.";
            }
        } else if (isAudio) {
            const audioMode = getAudioMode(model);
            temporalInstruct = AUDIO_STRUCTURE_RULES[audioMode];
            role = masterRole ? `Master Role: ${masterRole}\nTask Role: Master Sound Engineer.` : "Master Sound Engineer.";
            protocol = AUDIO_MODE_PROTOCOLS[audioMode];
        } else {
            protocol = `IMAGE PROTOCOL: This is for a STATIC image. Do NOT include temporal descriptions or motion verbs. Focus on composition, lighting, and texture. ${IMAGE_GENERATION_WORKFLOW}`;
        }

        const spatialInstruct = isAudio ? '' : `\n[SPATIAL GEOMETRY & MESH DESCRIPTORS]: If the layout has geometric or coordinate traits, describe boundaries explicitly using 3D spatial points [X, Y, Z], surface normal extrusions, or wireframe grid tessellations.`;

        return `Role: ${role} Optimized for ${model}.
Task: Rewrite the user's concept into the absolute best possible ${syntax.format} formula for ${model}.
Rules: ${syntax.rules}. ${protocol}
${temporalInstruct}
${spatialInstruct}
CRITICAL: Camera specifications (Body/Model) are technical metadata. Do NOT suggest a person holding the camera.
Goal: Maximize accuracy to the user's intent while injecting unique, high-quality stylistic details that ${model} excels at.
Output the refined prompt text ONLY.`;
    },
    
    DECONSTRUCTOR: (wildcards: string[]) => {
        return `Role: Prompt Deconstructor & Template Architect. 
Task: Convert the user's prompt into a reusable template.
Constraint: You MUST replace specific descriptive words or phrases with placeholders from the provided list.
Placeholders available: ${wildcards.join(', ')}.
Rules: 
1. Placeholders must be wrapped in double underscores: __name__.
2. If a word matches the theme of a placeholder but not the exact text, use the placeholder.
3. Keep the prompt's overall structure and non-replaceable descriptive terms intact.
4. Output the TEMPLATE ONLY. No explanation.`;
    }
};

export const cleanLLMResponse = (text: string): string => {
    let cleaned = text.replace(/<(think|thought)>[\s\S]*?(<\/\1>|$)/gi, '').trim();
    cleaned = cleaned.replace(/```[a-z]*\n([\s\S]*?)\n```/gi, '$1').replace(/`/g, '');
    const stopWords = [/^here/i, /^sure/i, /^certainly/i, /^okay/i, /^1\.\s/i];
    return cleaned.split('\n')
        .map(l => l.trim().replace(/^(\d+[\.\)]|\*|-|\+)\s+/, ''))
        .filter(l => l && !stopWords.some(r => r.test(l)))
        .join('\n').trim();
};

export const buildContextForEnhancer = (
    modifiers: PromptModifiers,
    isAudio: boolean = false,
    modifierWeights: Record<string, number> = {},
    targetAIModel: string = ''
): string => {
    const ctx = [];
    // Applies model-appropriate weight syntax (e.g. SDXL's `(token:1.30)`) to a
    // modifier value before it's dropped into the context block. Weight 1.0
    // (the slider default, and the value for any modifier with no slider
    // touched) returns the token unchanged — see serializeModifierToken.
    const w = (key: string, value: string) => serializeModifierToken(value, modifierWeights[key] ?? 1.0, targetAIModel);

    if (modifiers.artStyle) ctx.push(`Movement: ${w('artStyle', modifiers.artStyle)}`);
    if (modifiers.artist) ctx.push(`Creator: ${w('artist', modifiers.artist)}`);
    if (modifiers.aestheticLook) ctx.push(`Cinematic Look: ${w('aestheticLook', modifiers.aestheticLook)}`);
    if (modifiers.digitalAesthetic) ctx.push(`Aesthetic: ${w('digitalAesthetic', modifiers.digitalAesthetic)}`);
    if (modifiers.facialExpression) ctx.push(`Persona Expression: ${w('facialExpression', modifiers.facialExpression)}`);
    if (modifiers.hairStyle) ctx.push(`Hair Style: ${w('hairStyle', modifiers.hairStyle)}`);
    if (modifiers.eyeColor) ctx.push(`Eye Color: ${w('eyeColor', modifiers.eyeColor)}`);
    if (modifiers.skinTexture) ctx.push(`Skin Texture: ${w('skinTexture', modifiers.skinTexture)}`);
    if (modifiers.realism) ctx.push(`Realism Engine: ${w('realism', modifiers.realism)}`);
    if (modifiers.clothing) ctx.push(`Clothing/Outfit: ${w('clothing', modifiers.clothing)}`);
    if (modifiers.zImageStyle) ctx.push(`Z-Image Variant: ${modifiers.zImageStyle}`);

    if (modifiers.cameraType) ctx.push(`Camera Body: ${modifiers.cameraType}`);
    if (modifiers.cameraModel) ctx.push(`Camera Model: ${w('cameraModel', modifiers.cameraModel)}`);

    if (modifiers.filmStock) {
        const stock = w('filmStock', modifiers.filmStock);
        if (modifiers.cameraType === 'Analog Film Camera') {
            ctx.push(`Authentic Analog Load: ${stock} film stock`);
        } else if (modifiers.cameraType && modifiers.cameraType !== 'Analog Film Camera') {
            ctx.push(`Digital Capture Post-Processed to Emulate: ${stock} aesthetic`);
        } else {
            ctx.push(`Film Reference: ${stock}`);
        }
    }

    if (modifiers.specialtyLens) ctx.push(`Specialty Lens Characteristic: ${w('specialtyLens', modifiers.specialtyLens)}`);
    if (modifiers.lensType) ctx.push(`Lens: ${w('lensType', modifiers.lensType)}`);
    if (modifiers.cameraAngle) ctx.push(`Angle: ${w('cameraAngle', modifiers.cameraAngle)}`);
    if (modifiers.cameraProximity) ctx.push(`Framing: ${w('cameraProximity', modifiers.cameraProximity)}`);
    if (modifiers.cameraSettings) ctx.push(`Settings: ${w('cameraSettings', modifiers.cameraSettings)}`);
    if (modifiers.cameraEffect) ctx.push(`Effect: ${w('cameraEffect', modifiers.cameraEffect)}`);

    if (modifiers.lighting) ctx.push(`Lighting: ${w('lighting', modifiers.lighting)}`);
    if (modifiers.composition) ctx.push(`Composition: ${w('composition', modifiers.composition)}`);
    if (modifiers.timeOfDay) ctx.push(`Time of Day: ${w('timeOfDay', modifiers.timeOfDay)}`);
    if (modifiers.weather) ctx.push(`Weather: ${w('weather', modifiers.weather)}`);
    if (modifiers.colorGrade) ctx.push(`Color Grade: ${w('colorGrade', modifiers.colorGrade)}`);
    if (modifiers.photographyStyle) ctx.push(`Genre: ${w('photographyStyle', modifiers.photographyStyle)}`);
    if (modifiers.filmType) ctx.push(`Medium: ${modifiers.filmType}`);
    if (modifiers.aspectRatio) ctx.push(`Aspect Ratio: ${modifiers.aspectRatio}`);

    if (modifiers.motion) ctx.push(`Dynamics: ${w('motion', modifiers.motion)}`);
    if (modifiers.cameraMovement) ctx.push(`Camera Path: ${w('cameraMovement', modifiers.cameraMovement)}`);
    if (modifiers.videoEffect) ctx.push(`Video Effect / Post-Processing: ${w('videoEffect', modifiers.videoEffect)}`);

    if (modifiers.audioType) ctx.push(`Type: ${modifiers.audioType}`);
    if (modifiers.voiceGender) ctx.push(`Voice: ${modifiers.voiceGender}`);
    if (modifiers.voiceTone) ctx.push(`Tone: ${modifiers.voiceTone}`);
    if (modifiers.audioEnvironment) ctx.push(`Acoustics: ${modifiers.audioEnvironment}`);
    if (modifiers.audioMood) ctx.push(`Mood: ${modifiers.audioMood}`);
    if (isAudio && modifiers.musicGenre) ctx.push(`Music Genre: ${modifiers.musicGenre}`);
    if (isAudio && modifiers.instrumentation) ctx.push(`Instrumentation: ${modifiers.instrumentation}`);
    if (isAudio && modifiers.vocalStyle) ctx.push(`Vocal Style: ${modifiers.vocalStyle}`);
    if (isAudio && modifiers.productionEra) ctx.push(`Production Era: ${modifiers.productionEra}`);
    if (isAudio && modifiers.audioDuration) ctx.push(`Duration: ${modifiers.audioDuration}s`);

    return ctx.length ? `[Architectural Constraints]\n${ctx.join('\n')}` : '';
};

export const buildMidjourneyParams = (modifiers: PromptModifiers): string => {
    const params: string[] = [];
    if (modifiers.mjAspectRatio) params.push(`--ar ${modifiers.mjAspectRatio}`);
    if (modifiers.mjChaos && modifiers.mjChaos !== '0') params.push(`--c ${modifiers.mjChaos}`);
    if (modifiers.mjStylize && modifiers.mjStylize !== '100') params.push(`--s ${modifiers.mjStylize}`);
    if (modifiers.mjWeird && modifiers.mjWeird !== '0') params.push(`--weird ${modifiers.mjWeird}`);
    if (modifiers.mjVersion) params.push(`--v ${modifiers.mjVersion}`);
    if (modifiers.mjNiji) params.push(`--niji ${modifiers.mjNiji}`);
    if (modifiers.mjStyle) params.push(`--style ${modifiers.mjStyle}`);
    if (modifiers.mjTile) params.push(`--tile`);
    if (modifiers.mjNo) params.push(`--no ${modifiers.mjNo}`);
    if (modifiers.mjQuality) params.push(`--q ${modifiers.mjQuality}`);
    if (modifiers.mjSeed) params.push(`--seed ${modifiers.mjSeed}`);
    if (modifiers.mjStop) params.push(`--stop ${modifiers.mjStop}`);
    if (modifiers.mjRepeat) params.push(`--repeat ${modifiers.mjRepeat}`);
    return params.join(' ');
};

export async function* stripReasoningTags(stream: AsyncGenerator<string>): AsyncGenerator<string> {
    let inThought = false;
    for await (const chunk of stream) {
        let processChunk = chunk;
        if (processChunk.includes('<think') && processChunk.includes('</think>')) {
            processChunk = processChunk.replace(/<think[\s\S]*?<\/think>/g, '');
        } else if (processChunk.includes('<thought') && processChunk.includes('</thought>')) {
            processChunk = processChunk.replace(/<thought[\s\S]*?<\/thought>/g, '');
        } else {
            if (processChunk.includes('<think') || processChunk.includes('<thought')) {
                inThought = true;
                const parts = processChunk.split(/<think|<thought/);
                if (parts[0]) yield parts[0];
                continue;
            }
            if (processChunk.includes('<\/think>') || processChunk.includes('<\/thought>')) {
                inThought = false;
                const parts = processChunk.split(/<\/think>|<\/thought>/);
                if (parts[1]) yield parts[1];
                continue;
            }
        }
        if (!inThought && processChunk) {
            yield processChunk;
        }
    }
}

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings,
    referenceImages?: string[],
    modifierCatalog?: string,
    overrideProvider?: string,
    modifierWeights?: Record<string, number>
): AsyncGenerator<string> {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const isAudio = !!TARGET_AUDIO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength, isVideo, isAudio, hasManualCamera, modifiers.videoInputType, modifierCatalog, settings.masterRolePrompt);
    const context = buildContextForEnhancer(modifiers, isAudio, modifierWeights, targetAIModel);
    const input = `${context}\n\n[Primary Concept]\n${originalPrompt}`;

    const tokenBudget = promptLength === 'Long' ? 4096 : (promptLength === 'Medium' ? 2048 : 1024);
    const activeProvider = overrideProvider || getActiveProvider(settings);
    const temperature = modifiers.creativity !== undefined ? modifiers.creativity / 100 : 0.7;

    const stream = activeProvider === 'anthropic'
        ? (async function* () {
              const { streamChatAnthropic } = await import('./anthropicService');
              yield* streamChatAnthropic([{ role: 'system', content: systemInstruction }, { role: 'user', content: input }], settings);
          })()
        : activeProvider === 'llamacpp'
            ? enhancePromptLlamaCppStream(input, constantModifier, settings, systemInstruction, tokenBudget, temperature)
            : activeProvider === 'ollama'
                ? enhancePromptOllamaStream(input, constantModifier, settings, systemInstruction, tokenBudget)
                : enhancePromptGeminiStream(input, constantModifier, settings, systemInstruction, promptLength, referenceImages, temperature);

    yield* stripReasoningTags(stream);
}

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings, modifiers: PromptModifiers = {}): Promise<string> => {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const isAudio = !!TARGET_AUDIO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, isAudio, hasManualCamera, modifiers.videoInputType, settings.masterRolePrompt);
    
    const supported: LLMProvider[] = ['gemini', 'ollama', 'llamacpp', 'anthropic'];
    requireProvider('Prompt refinement', settings, supported);
    const raw = await withProviderFallback('Prompt refinement', settings, supported, async (provider) => {
        if (provider === 'anthropic') {
            const { streamChatAnthropic } = await import('./anthropicService');
            let text = '';
            for await (const chunk of streamChatAnthropic([{ role: 'system', content: sys }, { role: 'user', content: promptText }], settings)) {
                text += chunk;
            }
            return text;
        }
        return provider === 'llamacpp'
            ? await refineSinglePromptLlamaCpp(promptText, settings, sys, 1024)
            : provider === 'ollama' 
                ? await refineSinglePromptOllama(promptText, settings, sys, 1024)
                : await refineSinglePromptGemini(promptText, '', settings, sys);
    }, (from, to, err) => {
        appEventBus.emit('assistantFeedback', { message: `${from} failed (${err.message}). Retrying on ${to}.`, isError: false });
    });
    const cleaned = cleanLLMResponse(raw);
    return cleaned;
};

export async function* refineSinglePromptStream(
    promptText: string,
    targetAIModel: string,
    settings: LLMSettings,
    modifiers: PromptModifiers = {}
): AsyncGenerator<string> {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const isAudio = !!TARGET_AUDIO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, isAudio, hasManualCamera, modifiers.videoInputType, settings.masterRolePrompt);
    
    const provider = requireProvider('Prompt refinement stream', settings, ['gemini', 'ollama', 'llamacpp', 'anthropic']);
    const temperature = modifiers.creativity !== undefined ? modifiers.creativity / 100 : 0.7;
    const stream = provider === 'anthropic'
        ? (async function* () {
              const { streamChatAnthropic } = await import('./anthropicService');
              yield* streamChatAnthropic([{ role: 'system', content: sys }, { role: 'user', content: promptText }], settings);
          })()
        : provider === 'llamacpp'
            ? refineSinglePromptLlamaCppStream(promptText, settings, sys, 1024, temperature)
            : provider === 'ollama'
                ? refineSinglePromptOllamaStream(promptText, settings, sys, 1024)
                : refineSinglePromptGeminiStream(promptText, '', settings, sys);

    yield* stripReasoningTags(stream);
}

export const generateArtistDescription = async (artistName: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Artist description', settings, ['gemini', 'ollama', 'llamacpp']);
    
    if (provider === 'llamacpp') return refineSinglePromptLlamaCpp(artistName, settings, "Brief style summary. Text only.", 512);

    return provider === 'ollama'
        ? generateArtistDescriptionOllama(artistName, settings)
        : generateArtistDescriptionGemini(artistName, settings);
};

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Palette mood analysis', settings, ['gemini', 'ollama', 'llamacpp']);
    
    if (provider === 'llamacpp') return refineSinglePromptLlamaCpp(`Colors: ${hexColors.join(', ')}`, settings, "Task: mood in 3 words max. Text only.", 64);

    return provider === 'ollama'
        ? analyzePaletteMoodOllama(hexColors, settings)
        : analyzePaletteMoodGemini(hexColors, settings);
};

export const generateColorName = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Color name generation', settings, ['gemini', 'ollama', 'llamacpp']);
    
    if (provider === 'llamacpp') return refineSinglePromptLlamaCpp(`Hex:${hexColor}, Mood:${mood}`, settings, "Task: Poetic 2-word name. Text only.", 32);

    return provider === 'ollama'
        ? generateColorNameOllama(hexColor, mood, settings)
        : generateColorNameGemini(hexColor, mood, settings);
};

export const dissectPrompt = async (promptText: string, settings: LLMSettings, modifierCatalog?: string, modelName?: string): Promise<{ naturalLanguage: string, prompt: string, modifiers: { [key: string]: string }, constantModifier: string, categorizedParameters: { label: string, value: string }[] }> => {
    const provider = requireProvider('Prompt dissection', settings, ['gemini', 'ollama', 'llamacpp']);
    
    if (provider === 'llamacpp') {
        const naturalLang = await refineSinglePromptLlamaCpp(promptText, settings, "Task: Convert this Stable Diffusion prompt into a clear, natural English narrative. No intros.", 800);
        return { naturalLanguage: naturalLang, prompt: promptText, modifiers: {}, constantModifier: '', categorizedParameters: [] };
    }

    return provider === 'ollama'
        ? dissectPromptOllama(promptText, settings, modifierCatalog, modelName)
        : dissectPromptGemini(promptText, settings, modifierCatalog, modelName);
};

export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    const provider = requireProvider('Focused variations', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? generateFocusedVariationsOllama(promptText, components, settings)
        : generateFocusedVariationsGemini(promptText, components, settings);
};

export const reconstructPrompt = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Prompt reconstruction', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? reconstructPromptOllama(components, settings)
        : reconstructPromptGemini(components, settings);
};

export const replaceComponentInPrompt = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Component replacement', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? replaceComponentInPromptOllama(originalPrompt, componentKey, newValue, settings)
        : replaceComponentInPromptGemini(originalPrompt, componentKey, newValue, settings);
};

export const reconstructFromIntent = async (intents: string[], settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Intent reconstruction', settings, ['gemini', 'ollama', 'llamacpp']);
    if (provider === 'llamacpp') return reconstructFromIntentLlamaCpp(intents, settings);
    return provider === 'ollama'
        ? reconstructFromIntentOllama(intents, settings)
        : reconstructFromIntentGemini(intents, settings);
};

export const abstractImage = async (base64ImageData: string, promptLength: string, targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    const provider = requireProvider('Image abstraction', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? abstractImageOllama(base64ImageData, promptLength, targetAIModel, settings)
        : abstractImageGemini(base64ImageData, promptLength, targetAIModel, settings);
};

/** Raw tag-suggestion text from the active provider.
 *  Vision-capable providers only — throws ProviderUnsupportedError otherwise,
 *  because silently switching would leak a prompt the user chose to keep local. */
export const suggestTagsRaw = async (base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Tag suggestion', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? suggestTagsRawOllama(base64ImageData, promptText, settings)
        : suggestTagsRawGemini(base64ImageData, promptText, settings);
};

export const generatePromptFormulaWithAI = async (promptText: string, wildcards: string[], settings: LLMSettings): Promise<string> => {
    const sys = AI_ROLES.DECONSTRUCTOR(wildcards);
    const provider = requireProvider('Formula generation', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? generatePromptFormulaOllama(promptText, settings, sys)
        : generatePromptFormulaGemini(promptText, settings, sys);
};

export const generateConstructorPreset = async (components: { [key: string]: string }, settings: LLMSettings, modifierCatalog?: string, modelName?: string): Promise<{ prompt: string, modifiers: PromptModifiers, constantModifier?: string }> => {
    const provider = requireProvider('Constructor preset', settings, ['gemini', 'ollama']);
    
    if (provider === 'ollama') {
        const sys = `Role: Prompt Constructor Architect. 
Task: Deconstruct the analyzed prompt components into a "Prompt Idea" (base subject/intent), "Active Construction Items" (mapped modifiers), and "Constant Modifiers" (unmapped details).

Mapping Protocol:
1. Identify components that match or are highly similar to these Refiner categories:
   - artStyle, artist, photographyStyle, aestheticLook, digitalAesthetic, aspectRatio, cameraType, cameraAngle, cameraProximity, cameraSettings, cameraEffect, specialtyLens, lensType, filmType, filmStock, lighting, composition, facialExpression, hairStyle, eyeColor, skinTexture, clothing, motion, cameraMovement, mjVersion, mjNiji, mjAspectRatio, zImageStyle

${modifierCatalog ? `[AVAILABLE MODIFIERS CATALOG]\n${modifierCatalog}\n\nSTRICT RULE: You MUST prioritize mapping to the values provided in the catalog above if a match or close synonym is found.` : ''}

2. Extraction Logic:
   - If a component matches both a category AND a specific value from the catalog, add it to the "modifiers" object.
   - If a component matches a category but the value is NOT in the catalog, add it to the "constantModifier" string.
   - The core subject goes into the "prompt" (Prompt Idea).
   - IMPORTANT: Strip all modifiers from the "prompt" field.

Output: A JSON object:
{
  "prompt": "The core subject/intent",
  "modifiers": { "categoryKey": "Value", ... },
  "constantModifier": "Unmapped modifiers"
}
Output JSON ONLY.`;

        const input = JSON.stringify(components, null, 2);
        const raw = await refineSinglePromptOllama(input, settings, sys, 1024);
        try {
            const result = JSON.parse(cleanLLMResponse(raw));
            return {
                prompt: result.prompt || '',
                modifiers: result.modifiers || {},
                constantModifier: result.constantModifier || ''
            };
        } catch (e) {
            return { prompt: cleanLLMResponse(raw), modifiers: {}, constantModifier: '' };
        }
    } else {
        return generateConstructorPresetGemini(components, settings, modifierCatalog, modelName);
    }
};

export { generateWithImagen, generateWithNanoBanana, generateWithVeo } from './geminiService';

// Removed storyboard translation

export const translateToEnglish = async (text: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Translation', settings, ['gemini', 'ollama', 'llamacpp']);
    if (provider === 'llamacpp') {
        return refineSinglePromptLlamaCpp(text, settings, "Translate this to high-fidelity English visual prompt. Output translated text ONLY.", 1200);
    }
    if (provider === 'ollama') {
        return refineSinglePromptOllama(text, settings, "Translate this to high-fidelity English visual prompt. Output translated text ONLY.", 1200);
    }
    return translateToEnglishGemini(text, settings);
};

export interface OllamaTestResult {
    success: boolean;
    status?: number;
    message: string;
}

export const testOllamaConnection = async (baseUrl: string): Promise<OllamaTestResult> => {
    const cleanUrl = baseUrl.replace(/\/+$/, '').replace(/\/api\/tags\/?$/, '').replace(/\/api\/?$/, '');
    let targetUrl = cleanUrl;
    let headers: Record<string, string> = {};
    
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (cleanUrl.includes('localhost:') || cleanUrl.includes('127.0.0.1:')) {
            // Optimization: Skip local fetch in cloud to avoid proxy noise
            return { success: false, message: "LOCAL TARGET UNREACHABLE IN CLOUD. USE REMOTE OR RUN LOCALLY." };
        } else if (cleanUrl.startsWith('http:')) {
            targetUrl = '/proxy-remote';
            headers['x-target-url'] = cleanUrl;
        }
    }

    try {
        const response = await fetch(`${targetUrl}/api/tags`, { headers });
        if (response.ok) {
            return { success: true, status: response.status, message: "CONNECTION ESTABLISHED (200 OK)" };
        }
        
        const msg = response.status === 500 
            ? "TARGET UNREACHABLE (500). ENSURE OLLAMA IS RUNNING."
            : `HTTP ERROR ${response.status}: ${response.statusText}`;
            
        return { success: false, status: response.status, message: msg };
    } catch (e: any) {
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            if (window.location.protocol === 'https:' && cleanUrl.startsWith('http:') && !headers['x-target-url']) {
                return { success: false, message: "PROTOCOL MISMATCH (HTTPS -> HTTP BLOCKED). USE PROXY." };
            }
            return { success: false, message: "SERVICE REFUSED CONNECTION. CHECK OLLAMA_ORIGINS." };
        }
        return { success: false, message: e.message || "CONNECTION REFUSED" };
    }
};

const decodeBase64UTF8 = (b64: string) => {
    const data = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
    const binString = atob(data);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
};

export async function* streamChat(
    messages: { role: 'user' | 'assistant' | 'system', content: string, attachments?: { data: string, mimeType: string, fileName?: string }[] }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    const supported: LLMProvider[] = ['gemini', 'ollama', 'openrouter', 'llamacpp', 'anthropic'];
    requireProvider('Chat', settings, supported);

    // Process text attachments from messages before passing to specific handlers
    const processedMessages = await Promise.all(messages.map(async msg => {
        if (msg.role !== 'user' || !msg.attachments) return msg;

        let appendedContent = '';
        const keptAttachments: any[] = [];
        
        for (const att of msg.attachments) {
            // Process text-like formats directly into the prompt text
            const mt = att.mimeType.toLowerCase();
            const fn = (att.fileName || '').toLowerCase();
            
            try {
                if (mt.startsWith('text/') || mt === 'application/json' || mt === 'application/csv' || mt === 'application/xml' || fn.endsWith('.md') || fn.endsWith('.csv') || fn.endsWith('.log')) {
                    const text = decodeBase64UTF8(att.data);
                    appendedContent += `\n\n--- Attachment: ${att.fileName || 'Document'} ---\n${text}\n--- End Attachment ---\n`;
                } else if (mt === 'application/pdf' || fn.endsWith('.pdf')) {
                    const { extractTextFromPdf } = await import('../utils/documentParser');
                    const base64Data = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
                    const text = await extractTextFromPdf(base64Data);
                    appendedContent += `\n\n--- Attachment: ${att.fileName || 'PDF Document'} ---\n${text}\n--- End Attachment ---\n`;
                } else if (mt.includes('wordprocessingml') || mt === 'application/msword' || fn.endsWith('.docx') || fn.endsWith('.doc')) {
                    const { extractTextFromDocx } = await import('../utils/documentParser');
                    const base64Data = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
                    const text = await extractTextFromDocx(base64Data);
                    appendedContent += `\n\n--- Attachment: ${att.fileName || 'Word Document'} ---\n${text}\n--- End Attachment ---\n`;
                } else {
                    keptAttachments.push(att);
                }
            } catch (e) {
                console.error(`Failed to process attachment ${att.fileName}:`, e);
                // Keep it so the downstream service can attempt to parse it (like Gemini with PDF)
                keptAttachments.push(att);
            }
        }
        
        return {
            ...msg,
            content: msg.content + appendedContent,
            attachments: keptAttachments.length > 0 ? keptAttachments : undefined
        };
    }));

    let finalMessages = [...processedMessages];
    if (settings.masterRolePrompt && settings.masterRolePrompt.trim()) {
        const masterPrompt = settings.masterRolePrompt.trim();
        const systemMessageIdx = finalMessages.findIndex(m => m.role === 'system');
        if (systemMessageIdx !== -1) {
            finalMessages = finalMessages.map((msg, idx) => {
                if (idx === systemMessageIdx) {
                    return {
                        ...msg,
                        content: `${masterPrompt}\n\n${msg.content}`
                    };
                }
                return msg;
            });
        } else {
            finalMessages.unshift({
                role: 'system',
                content: masterPrompt
            });
        }
    }

    const stream = await withProviderFallback('Chat', settings, supported, async (provider) => {
        if (provider === 'anthropic') {
            const { streamChatAnthropic } = await import('./anthropicService');
            return streamChatAnthropic(finalMessages, settings);
        } else if (provider === 'openrouter') {
            const { streamChatOpenRouter } = await import('./openrouterService');
            return streamChatOpenRouter(finalMessages, settings);
        } else if (provider === 'ollama') {
            const { streamChatOllama } = await import('./ollamaService');
            return streamChatOllama(finalMessages, settings);
        } else if (provider === 'llamacpp') {
            const { streamChatLlamaCpp } = await import('./llamacppService');
            return streamChatLlamaCpp(finalMessages, settings);
        } else {
            const { streamChatGemini } = await import('./geminiService');
            return streamChatGemini(finalMessages, settings);
        }
    }, (from, to, err) => {
        appEventBus.emit('assistantFeedback', { message: `${from} failed (${err.message}). Retrying on ${to}.`, isError: false });
    });
    yield* stream;
}
