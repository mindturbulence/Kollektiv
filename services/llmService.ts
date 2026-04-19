
import type { EnhancementResult, LLMSettings, PromptModifiers } from '../types';
import { translateToEnglishGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream, generateConstructorPresetGemini } from './geminiService';
import { analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';

// --- Model-Specific Syntax (Engine Tuning) ---
const getModelSyntax = (model: string) => {
    const lower = model.toLowerCase();
    
    // Video Architectures
    if (lower.includes('ltx')) return { 
        format: "Temporal Narrative.", 
        rules: "Describe sequence of action with physical verbs. Focus on physics-based motion, high temporal consistency, and realistic material deformation. Use natural language prose." 
    };
    if (lower.includes('veo')) return { 
        format: "Cinematic Flow.", 
        rules: "Describe lighting interactions, atmospheric density, and camera motion verbs. Focus on high-fidelity fluid action and cinematic color grading. Use evocative, descriptive prose." 
    };
    if (lower.includes('kling')) return { 
        format: "Technical Cinematic Tags.", 
        rules: "Mix natural language with technical lighting and physics descriptors. High detail on fluid dynamics, material properties, and complex human interactions." 
    };
    if (lower.includes('runway')) return { 
        format: "High-Impact Prose.", 
        rules: "Direct, descriptive sentences focusing on material consistency, global illumination, and specific motion vectors. Avoid fluff; be visually precise." 
    };
    if (lower.includes('luma')) return { 
        format: "Dynamic Keyframes.", 
        rules: "Focus on the transition between the start and end of the motion. Highly descriptive of speed, direction changes, and dramatic camera shifts." 
    };
    if (lower.includes('sora')) return {
        format: "Hyper-Realistic Narrative.",
        rules: "Extremely detailed descriptions of complex scenes with multiple characters, specific types of motion, and precise background details. Focus on physical realism."
    };
    if (lower.includes('wan video') || lower.includes('hunyuan video')) return {
        format: "Dense Visual Script.",
        rules: "Describe the scene with a focus on spatial relationships, character expressions, and environmental changes over time. High emphasis on consistent character features."
    };

    // Image Architectures
    if (lower.includes('flux')) return { 
        format: "Dense Descriptive Paragraph.", 
        rules: "Natural language focusing on micro-textures, lighting interaction, and realistic material rendering. Describe the scene as if explaining it to a master painter. Avoid tag-lists. Mention 'hyper-realistic' or 'raw' if appropriate. Follow the STRICT IMAGE WORKFLOW for content structure." 
    };
    if (lower.includes('imagen')) return { 
        format: "Clear Semantic Prose.", 
        rules: "High semantic accuracy. Describe relationships between objects and environmental lighting clearly. Focus on composition and clear subject-background separation. Follow the STRICT IMAGE WORKFLOW." 
    };
    if (lower.includes('midjourney')) return { 
        format: "Stylized Aesthetic Tags.", 
        rules: "Focus on style, medium, lighting mood, and artistic influence. Use evocative adjectives. Do NOT output params like --ar; they are handled via modifiers. Use latest style cues. Adapt the STRICT IMAGE WORKFLOW to this tag-based structure." 
    };
    if (lower.includes('stable diffusion') || lower.includes('sdxl')) return {
        format: "Structured Descriptive Tags.",
        rules: "Mix of descriptive phrases and specific keywords. Focus on lighting (e.g., 'volumetric lighting'), quality (e.g., 'highly detailed'), and style (e.g., 'digital art'). Follow the STRICT IMAGE WORKFLOW."
    };
    if (lower.includes('pony') || lower.includes('illustrious')) return { 
        format: "Weighted Tags.", 
        rules: "Start with quality scores (score_9, score_8_up, etc). Use descriptive tags for subjects, specific stylistic triggers, and Danbooru-style tagging conventions. Follow the STRICT IMAGE WORKFLOW." 
    };
    if (lower.includes('gpt-') || lower.includes('dall-e')) return {
        format: "Rich Narrative Prose.",
        rules: "Highly descriptive, imaginative, and literal. DALL-E follows instructions perfectly, so describe exactly what should be in the frame, including text if requested. Follow the STRICT IMAGE WORKFLOW."
    };
    if (lower.includes('ideogram')) return {
        format: "Graphic Design Focus.",
        rules: "Focus on typography, layout, and clean graphic elements. Describe text placement and font styles clearly if applicable. Follow the STRICT IMAGE WORKFLOW."
    };
    if (lower.includes('janus') || lower.includes('deepseek')) return {
        format: "Balanced Semantic Tags.",
        rules: "Focus on subject clarity and environmental context. Use a mix of natural language and descriptive keywords. Follow the STRICT IMAGE WORKFLOW."
    };
    
    // Audio Architectures
    if (lower.includes('elevenlabs')) return { 
        format: "Dialogue Script.", 
        rules: "Include [emotional cues] or [breath sounds] for natural delivery. Focus on cadence, emphasis, and character-specific vocal quirks." 
    };
    if (lower.includes('suno') || lower.includes('udio')) return { 
        format: "Musical Structure.", 
        rules: "Define [Genre], [Instruments], [Mood], [Tempo], and structure (Verse, Chorus, Bridge, Drop). Use descriptive musical terms and production style cues." 
    };
    if (lower.includes('mmaudio')) return { 
        format: "Layered Sonic Textures.", 
        rules: "Describe the layers of sound, material impact, and acoustic environment (reverb, echo, spatial positioning). Focus on foley-style detail." 
    };

    return { format: "Natural Language.", rules: "Cohesive visual or conceptual description with high attention to detail and unique stylistic flair." };
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

FINAL OUTPUT CONSTRAINTS:
- Be in English.
- Be objective, concrete, and free of metaphors or emotional language.
- Exclude meta-tags like "8K", "masterpiece", or "ultra-detailed".
- CONTAIN ONLY THE FINAL PROMPT—NO EXPLANATIONS, TITLES, OR FORMATTING.
`;

const AI_ROLES = {
    ENHANCER: (model: string, length: string, isVideo: boolean, isAudio: boolean, _hasManualCamera: boolean, inputType?: string) => {
        const syntax = getModelSyntax(model);
        const l = length === 'Short' ? '40 words' : length === 'Long' ? '600+ words' : '220 words';
        const isI2V = isVideo && inputType === 'i2v';

        let persona = "Role: World-Class Visual Strategist and Prompt Architect.";
        let modeProtocol = "Focus on unique, high-fidelity textures, atmospheric depth, and sophisticated storytelling. CRITICAL: Camera specifications (Body/Model) are technical metadata for the capture device. Do NOT describe a person holding the camera or the camera appearing in the scene.";

        if (isVideo) {
            persona = "Role: Visionary Cinematic Director.";
            if (isI2V) {
                modeProtocol = `I2V PROTOCOL (DIRECTING AN IMAGE): The user is providing a reference image. Assume the subject, colors, and static details are already set. DO NOT describe colors or objects in the image. Focus EXCLUSIVELY on directing movement, camera paths, and temporal shifts. Strip all static adjectives. Output must be purely kinetic, efficient, and physically plausible.`;
            } else {
                modeProtocol = `T2V PROTOCOL (WORLD BUILDING): Build a cinematic world from scratch. Focus on composition, blocking, character action, and lighting that establishes a powerful narrative scene.`;
            }
        } else if (isAudio) {
            persona = "Role: Master Audio Producer and Sound Architect.";
            modeProtocol = "Acoustic focus. Map the frequency, rhythm, and sonic textures with extreme precision. If dialogue, focus on emotional delivery. If music, focus on instrumentation, production quality, and structural complexity.";
        } else {
            modeProtocol += ` IMAGE PROTOCOL: This is for a STATIC image. Do NOT include temporal descriptions, durations, or motion verbs unless they describe a frozen moment in time. Focus on 'the decisive moment'. ${IMAGE_GENERATION_WORKFLOW}`;
        }

        return `${persona}
Goal: Generate 1 highly accurate, production-ready refined prompt.
Target Architecture: ${model}.
Syntax: ${syntax.format}. Rules: ${syntax.rules}. Target Len: ${l}.
${modeProtocol}

BREAKDOWN PROTOCOL:
At the end of your response, after a "---PROMPT_BREAKDOWN---" separator, provide a JSON object breaking down the prompt's anatomy.
- If specific modifiers (like style, camera, lighting) were used or implied, list them as keys.
- Always include at least: "subject", "lighting", "composition", "style/environment", and "location".
- Ensure the JSON is well-formatted and valid.
- CRITICAL: DO NOT include the full "refined prompt" string as a key/value inside this JSON object. Only include the analytical components.

CRITICAL: Even for short inputs, expand with creative, model-specific details that maximize the output quality of ${model}. Be unique, avoid generic descriptions.
Output: The refined prompt text first, then the separator, then the JSON breakdown.
NO INTROS, NO EXPLANATIONS.`;
    },

    REFINER: (model: string, isVideo: boolean, isAudio: boolean, _hasManualCamera: boolean, inputType?: string) => {
        const syntax = getModelSyntax(model);
        const isI2V = isVideo && inputType === 'i2v';
        
        let protocol = "";
        let role = "Elite Prompt Refiner and Model Specialist.";
        
        if (isVideo) {
            role = "Visionary Cinematic Director.";
            if (isI2V) {
                protocol = "I2V PROTOCOL: You are animating a fixed image. Strip all static descriptions of the subject. Focus ONLY on the physics of motion, camera pathing, and scene evolution.";
            } else {
                protocol = "T2V PROTOCOL: Direct the scene from text. Establish subject, environment, and motion sequence with cinematic precision.";
            }
        } else if (isAudio) {
            role = "Master Sound Engineer.";
            protocol = "Focus on acoustics, material sounds, and rhythmic structure. Maximize sonic fidelity.";
        } else {
            protocol = `IMAGE PROTOCOL: This is for a STATIC image. Do NOT include temporal descriptions or motion verbs. Focus on composition, lighting, and texture. ${IMAGE_GENERATION_WORKFLOW}`;
        }

        return `Role: ${role} Optimized for ${model}.
Task: Rewrite the user's concept into the absolute best possible ${syntax.format} formula for ${model}.
Rules: ${syntax.rules}. ${protocol}
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

export const buildContextForEnhancer = (modifiers: PromptModifiers, isAudio: boolean = false): string => {
    const ctx = [];
    
    if (modifiers.artStyle) ctx.push(`Movement: ${modifiers.artStyle}`);
    if (modifiers.artist) ctx.push(`Creator: ${modifiers.artist}`);
    if (modifiers.aestheticLook) ctx.push(`Cinematic Look: ${modifiers.aestheticLook}`);
    if (modifiers.digitalAesthetic) ctx.push(`Aesthetic: ${modifiers.digitalAesthetic}`);
    if (modifiers.facialExpression) ctx.push(`Persona Expression: ${modifiers.facialExpression}`);
    if (modifiers.hairStyle) ctx.push(`Hair Style: ${modifiers.hairStyle}`);
    if (modifiers.eyeColor) ctx.push(`Eye Color: ${modifiers.eyeColor}`);
    if (modifiers.skinTexture) ctx.push(`Skin Texture: ${modifiers.skinTexture}`);
    if (modifiers.clothing) ctx.push(`Clothing/Outfit: ${modifiers.clothing}`);
    if (modifiers.zImageStyle) ctx.push(`Z-Image Variant: ${modifiers.zImageStyle}`);
    
    if (modifiers.cameraType) ctx.push(`Camera Body: ${modifiers.cameraType}`);
    if (modifiers.cameraModel) ctx.push(`Camera Model: ${modifiers.cameraModel}`);
    
    if (modifiers.filmStock) {
        if (modifiers.cameraType === 'Analog Film Camera') {
            ctx.push(`Authentic Analog Load: ${modifiers.filmStock} film stock`);
        } else if (modifiers.cameraType && modifiers.cameraType !== 'Analog Film Camera') {
            ctx.push(`Digital Capture Post-Processed to Emulate: ${modifiers.filmStock} aesthetic`);
        } else {
            ctx.push(`Film Reference: ${modifiers.filmStock}`);
        }
    }

    if (modifiers.specialtyLens) ctx.push(`Specialty Lens Characteristic: ${modifiers.specialtyLens}`);
    if (modifiers.lensType) ctx.push(`Lens: ${modifiers.lensType}`);
    if (modifiers.cameraAngle) ctx.push(`Angle: ${modifiers.cameraAngle}`);
    if (modifiers.cameraProximity) ctx.push(`Framing: ${modifiers.cameraProximity}`);
    if (modifiers.cameraSettings) ctx.push(`Settings: ${modifiers.cameraSettings}`);
    if (modifiers.cameraEffect) ctx.push(`Effect: ${modifiers.cameraEffect}`);
    
    if (modifiers.lighting) ctx.push(`Lighting: ${modifiers.lighting}`);
    if (modifiers.composition) ctx.push(`Composition: ${modifiers.composition}`);
    if (modifiers.photographyStyle) ctx.push(`Genre: ${modifiers.photographyStyle}`);
    if (modifiers.filmType) ctx.push(`Medium: ${modifiers.filmType}`);
    if (modifiers.aspectRatio) ctx.push(`Aspect Ratio: ${modifiers.aspectRatio}`);

    if (modifiers.motion) ctx.push(`Dynamics: ${modifiers.motion}`);
    if (modifiers.cameraMovement) ctx.push(`Camera Path: ${modifiers.cameraMovement}`);

    if (modifiers.audioType) ctx.push(`Type: ${modifiers.audioType}`);
    if (modifiers.voiceGender) ctx.push(`Voice: ${modifiers.voiceGender}`);
    if (modifiers.voiceTone) ctx.push(`Tone: ${modifiers.voiceTone}`);
    if (modifiers.audioEnvironment) ctx.push(`Acoustics: ${modifiers.audioEnvironment}`);
    if (modifiers.audioMood) ctx.push(`Mood: ${modifiers.audioMood}`);
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

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings,
    referenceImages?: string[]
): AsyncGenerator<string> {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const isAudio = !!TARGET_AUDIO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength, isVideo, isAudio, hasManualCamera, modifiers.videoInputType);
    const context = buildContextForEnhancer(modifiers, isAudio);
    const input = `${context}\n\n[Primary Concept]\n${originalPrompt}`;

    const tokenBudget = promptLength === 'Long' ? 2500 : 1024;
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const temperature = modifiers.creativity !== undefined ? modifiers.creativity / 100 : 0.7;

    const stream = isOllama
        ? enhancePromptOllamaStream(input, constantModifier, settings, systemInstruction, tokenBudget)
        : enhancePromptGeminiStream(input, constantModifier, settings, systemInstruction, promptLength, referenceImages, temperature);

    let inThought = false;
    for await (const chunk of stream) {
        if (chunk.includes('<think') || chunk.includes('<thought')) { inThought = true; continue; }
        if (chunk.includes('</think') || chunk.includes('</thought')) { inThought = false; continue; }
        if (!inThought) yield chunk;
    }
}

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings, modifiers: PromptModifiers = {}): Promise<string> => {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const isAudio = !!TARGET_AUDIO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, isAudio, hasManualCamera, modifiers.videoInputType);
    
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const raw = isOllama 
        ? await refineSinglePromptOllama(promptText, settings, sys, 1024)
        : await refineSinglePromptGemini(promptText, '', settings, sys);
    return cleanLLMResponse(raw);
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
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, isAudio, hasManualCamera, modifiers.videoInputType);
    
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const stream = isOllama
        ? refineSinglePromptOllamaStream(promptText, settings, sys, 1024)
        : refineSinglePromptGeminiStream(promptText, '', settings, sys);

    let inThought = false;
    for await (const chunk of stream) {
        if (chunk.includes('<think') || chunk.includes('<thought')) { inThought = true; continue; }
        if (chunk.includes('</think') || chunk.includes('</thought')) { inThought = false; continue; }
        if (!inThought) yield chunk;
    }
}

export const generateArtistDescription = async (artistName: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? generateArtistDescriptionOllama(artistName, settings)
        : generateArtistDescriptionGemini(artistName, settings);
};

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? analyzePaletteMoodOllama(hexColors, settings)
        : analyzePaletteMoodGemini(hexColors, settings);
};

export const generateColorName = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? generateColorNameOllama(hexColor, mood, settings)
        : generateColorNameGemini(hexColor, mood, settings);
};

export const dissectPrompt = async (promptText: string, settings: LLMSettings, modifierCatalog?: string): Promise<{ [key: string]: string }> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? dissectPromptOllama(promptText, settings)
        : dissectPromptGemini(promptText, settings, modifierCatalog);
};

export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? generateFocusedVariationsOllama(promptText, components, settings)
        : generateFocusedVariationsGemini(promptText, components, settings);
};

export const reconstructPrompt = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? reconstructPromptOllama(components, settings)
        : reconstructPromptGemini(components, settings);
};

export const replaceComponentInPrompt = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? replaceComponentInPromptOllama(originalPrompt, componentKey, newValue, settings)
        : replaceComponentInPromptGemini(originalPrompt, componentKey, newValue, settings);
};

export const reconstructFromIntent = async (intents: string[], settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? reconstructFromIntentOllama(intents, settings)
        : reconstructFromIntentGemini(intents, settings);
};

export const abstractImage = async (base64ImageData: string, promptLength: string, targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? abstractImageOllama(base64ImageData, promptLength, targetAIModel, settings)
        : abstractImageGemini(base64ImageData, promptLength, targetAIModel, settings);
};

export const generatePromptFormulaWithAI = async (promptText: string, wildcards: string[], settings: LLMSettings): Promise<string> => {
    const sys = AI_ROLES.DECONSTRUCTOR(wildcards);
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? generatePromptFormulaOllama(promptText, settings, sys)
        : generatePromptFormulaGemini(promptText, settings, sys);
};

export const generateConstructorPreset = async (components: { [key: string]: string }, settings: LLMSettings, modifierCatalog?: string): Promise<{ prompt: string, modifiers: PromptModifiers, constantModifier?: string }> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    
    if (isOllama) {
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
        return generateConstructorPresetGemini(components, settings, modifierCatalog);
    }
};

export { generateWithImagen, generateWithNanoBanana, generateWithVeo } from './geminiService';

// --- Translator for storyboarding feature ---
export const translateStoryboardScene = async (text: string, model: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const sys = `Role: Cinematic Translator for ${model}. 
Task: Convert this scene description into a high-fidelity visual prompt. 
Focus on: camera movement, lighting, atmospheric density, and temporal flow. 
Output the translated prompt ONLY. No intros.`;

    const raw = isOllama
        ? await refineSinglePromptOllama(text, settings, sys, 1024)
        : await refineSinglePromptGemini(text, '', settings, sys);
    return cleanLLMResponse(raw);
};

export const translateToEnglish = async (text: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    if (isOllama) {
        // Fallback or Ollama specific translation if needed later, for now just Gemini
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
    
    if (window.location.protocol === 'https:') {
        if (cleanUrl.includes('localhost:11434') || cleanUrl.includes('127.0.0.1:11434')) {
            // Optimization: Skip local fetch in cloud to avoid proxy noise
            return { success: false, message: "LOCAL OLLAMA UNREACHABLE IN CLOUD. USE REMOTE ENDPOINT." };
        } else if (cleanUrl.startsWith('http')) {
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
