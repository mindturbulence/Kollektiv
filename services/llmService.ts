
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS } from '../constants/models';

// --- Model-Specific Reference Logic ---
const getModelSyntax = (model: string) => {
    const lower = model.toLowerCase();
    
    // Pony/Illustrious Scoring System
    if (lower.includes('pony') || lower.includes('illustrious')) {
        return {
            format: "Comma-separated tags + Scoring system.",
            prefix: "score_9, score_8_up, score_7_up, rating_safe, source_anime, ",
            rules: "Start with quality scores. Use specific descriptive tags with underscores (e.g., cyber_armor). Focus on character traits and artist names as tags."
        };
    }
    
    // Stable Diffusion Weighting (SDXL, SD3.5, Chroma)
    if (lower.includes('stable diffusion') || lower.includes('sdxl') || lower.includes('chroma')) {
        return {
            format: "Weighted keywords and descriptive phrases.",
            prefix: "masterpiece, best quality, ultra-detailed, ",
            rules: "Use (parentheses:1.2) for emphasis. Focus on: Subject > Style > Environment > Lighting > Technical specs."
        };
    }

    // High-End Textual Narrative Models (WAN, HunYuan, Flux, MJ, Grok, GPT, Luma, MiniMax, Seedance, Z-Image)
    if (lower.includes('flux') || lower.includes('z-image') || lower.includes('grok') || lower.includes('gpt') || lower.includes('seedance') || lower.includes('janus') || lower.includes('midjourney') || lower.includes('wan') || lower.includes('hunyuan') || lower.includes('luma') || lower.includes('minimax') || lower.includes('imagen') || lower.includes('hailuo')) {
        return {
            format: "Exquisite, high-utility natural language narrative.",
            prefix: "",
            rules: "Write a cohesive paragraph (or more for 'Long' mode) describing the 'Visual Physics' of the scene: how light interacts with specific materials, atmospheric density, and micro-textures. Describe depth of field and spatial relationships naturally. Avoid generic adjectives; use technical descriptors."
        };
    }

    return {
        format: "Natural language descriptive prose.",
        prefix: "",
        rules: "Clearly describe visual elements in cohesive sentences."
    };
};

// --- Token-Efficient & Model-Aware Roles ---
const AI_ROLES = {
    ENHANCER: (model: string, length: string, isVideo: boolean, hasManualCamera: boolean) => {
        const syntax = getModelSyntax(model);
        const lengthGuides = {
            'Short': 'approx 20 words. One punchy, evocative sentence.',
            'Medium': 'approx 70-100 words. A detailed descriptive paragraph.',
            'Long': 'MINIMUM 400 words. A sprawling visual epic. Detail every surface, light bounce, artistic influence, and technical specification (ISO, Aperture, Sensor type if applicable).'
        };
        const guide = lengthGuides[length as keyof typeof lengthGuides] || lengthGuides['Medium'];

        const videoLogic = isVideo 
            ? `[VIDEO AI MODE ACTIVE]
Rules for Temporal Consistency:
${hasManualCamera 
    ? "A specific camera movement is selected in the Modifiers tab. Use it exactly: [Modifier provided in Context]." 
    : "USER HAS OMITTED CAMERA MOVEMENT: You MUST autonomously and creatively invent a cinematic camera movement (e.g., 'A soaring drone shot descending into...', 'A slow, intimate dolly-in', 'An anamorphic tracking shot'). This movement must match the emotional weight of the subject."}` 
            : "";

        return `Role: Kollektiv Chief Prompt Architect for ${model}.
Target System Syntax: ${syntax.format}
Official Reference Rules: ${syntax.rules}
${videoLogic}

TASK: Generate 3 unique, high-tier variations of the USER SUBJECT.
MANDATORY: 
- Prepend "${syntax.prefix}" to every result if applicable.
- Detail Level [${length}]: Results MUST be ${guide}
- Output EXACTLY 3 lines. One result per line. 
- NO preamble, NO numbering, NO markdown, NO thinking blocks.`;
    },

    REFINER: (model: string, isVideo: boolean, hasManualCamera: boolean) => {
        const syntax = getModelSyntax(model);
        const videoLogic = isVideo && !hasManualCamera 
            ? "MANDATORY: Autonomously inject a creative cinematic camera movement that fits the scene's mood." 
            : "";
            
        return `Role: Art Director for ${model}. 
Task: Convert input into optimized ${syntax.format} based on these rules: ${syntax.rules}.
${videoLogic}
Requirement: Prepend "${syntax.prefix}" if necessary. Output ONLY the refined prompt text.`;
    },

    ANALYST: "Task: JSON dissect prompt into keys: subject, action, style, mood, composition, lighting, details. Output JSON only.",
    FORMULA_MAKER: (wildcardNames: string[]) => `Task: Replace terms with __wildcard__ placeholders. 
Available: ${wildcardNames.slice(0, 50).join(', ')}. 
Constraint: Output template ONLY.`
};

export const cleanLLMResponse = (text: string): string => {
    let cleaned = text.replace(/<(think|thought)>[\s\S]*?(<\/\1>|$)/gi, '').trim();
    cleaned = cleaned.replace(/```[a-z]*\n([\s\S]*?)\n```/gi, '$1').replace(/`/g, '');
    
    const stopWords = [/^here/i, /^sure/i, /^certainly/i, /^expanded/i, /^refined/i, /^output/i, /^okay/i, /^suggestion/i, /^the following/i, /^result/i, /^1\.\s/i];
    return cleaned.split('\n')
        .map(l => l.trim().replace(/^(\d+[\.\)]|\*|-|\+)\s+/, ''))
        .filter(l => l && !stopWords.some(r => r.test(l)))
        .join('\n').trim();
};

export const testOllamaConnection = async (baseUrl: string): Promise<boolean> => {
  if (!baseUrl || !baseUrl.startsWith('http')) return false;
  try {
    const response = await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch { return false; }
};

export const buildMidjourneyParams = (modifiers: PromptModifiers): string => {
    const p = [];
    if (modifiers.mjNo) p.push(`--no ${modifiers.mjNo}`);
    if (modifiers.mjAspectRatio) p.push(`--ar ${modifiers.mjAspectRatio}`);
    if (modifiers.mjChaos) p.push(`--chaos ${modifiers.mjChaos}`);
    if (modifiers.mjQuality) p.push(`--q ${modifiers.mjQuality}`);
    if (modifiers.mjStylize) p.push(`--stylize ${modifiers.mjStylize}`);
    if (modifiers.mjTile) p.push(`--tile`);
    if (modifiers.mjNiji) p.push(`--niji ${modifiers.mjNiji}`);
    else if (modifiers.mjVersion) p.push(`--v ${modifiers.mjVersion}`);
    return p.join(' ');
};

export const buildContextForEnhancer = (modifiers: PromptModifiers): string => {
    const ctx = [];
    if (modifiers.artStyle) ctx.push(`Art Style: ${modifiers.artStyle}`);
    if (modifiers.artist) ctx.push(`Artist: ${modifiers.artist}`);
    if (modifiers.zImageStyle) ctx.push(`Aesthetic: ${modifiers.zImageStyle}`);
    if (modifiers.photographyStyle) ctx.push(`Photography: ${modifiers.photographyStyle}`);
    if (modifiers.cameraAngle) ctx.push(`Angle: ${modifiers.cameraAngle}`);
    if (modifiers.cameraProximity) ctx.push(`Distance: ${modifiers.cameraProximity}`);
    if (modifiers.lighting) ctx.push(`Lighting: ${modifiers.lighting}`);
    if (modifiers.composition) ctx.push(`Composition: ${modifiers.composition}`);
    if (modifiers.cameraMovement) ctx.push(`Camera Movement: ${modifiers.cameraMovement}`);
    if (modifiers.motion) ctx.push(`Action/Motion: ${modifiers.motion}`);
    
    return ctx.length ? `[MANDATORY CONTEXT]\n${ctx.join('\n')}` : '';
};

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): AsyncGenerator<string> {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength, isVideo, hasManualCamera);
    const context = buildContextForEnhancer(modifiers);
    const input = `${context}\n\n[USER SUBJECT]\n${originalPrompt}`;

    const stream = settings.activeLLM === 'ollama'
        ? enhancePromptOllamaStream(input, constantModifier, settings, systemInstruction)
        : enhancePromptGeminiStream(input, constantModifier, settings, systemInstruction, promptLength);

    let inThought = false;
    for await (const chunk of stream) {
        if (chunk.includes('<think') || chunk.includes('<thought')) { inThought = true; continue; }
        if (chunk.includes('</think') || chunk.includes('</thought')) { inThought = false; continue; }
        if (!inThought) yield chunk;
    }
}

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings, modifiers: PromptModifiers = {}): Promise<string> => {
    const isVideo = !!TARGET_VIDEO_AI_MODELS.find(m => m === targetAIModel);
    const hasManualCamera = !!modifiers.cameraMovement;
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, hasManualCamera);
    const raw = settings.activeLLM === 'ollama' 
        ? await refineSinglePromptOllama(promptText, settings, sys)
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
    const hasManualCamera = !!modifiers.cameraMovement;
    const sys = AI_ROLES.REFINER(targetAIModel, isVideo, hasManualCamera);
    const stream = settings.activeLLM === 'ollama'
        ? refineSinglePromptOllamaStream(promptText, settings, sys)
        : refineSinglePromptGeminiStream(promptText, '', settings, sys);

    let inThought = false;
    for await (const chunk of stream) {
        if (chunk.includes('<think') || chunk.includes('<thought')) { inThought = true; continue; }
        if (chunk.includes('</think') || chunk.includes('</thought')) { inThought = false; continue; }
        if (!inThought) yield chunk;
    }
}

export const generatePromptFormulaWithAI = async (promptText: string, wildcardNames: string[], settings: LLMSettings): Promise<string> => {
    const sys = AI_ROLES.FORMULA_MAKER(wildcardNames);
    if (settings.activeLLM === 'ollama') return generatePromptFormulaOllama(promptText, settings, sys);
    return generatePromptFormulaGemini(promptText, settings, sys);
};

// Passthroughs
export const analyzePaletteMood = (hex: string[], s: LLMSettings) => s.activeLLM === 'ollama' ? analyzePaletteMoodOllama(hex, s) : analyzePaletteMoodGemini(hex, s);
export const generateColorName = (hex: string, mood: string, s: LLMSettings) => s.activeLLM === 'ollama' ? generateColorNameOllama(hex, mood, s) : generateColorNameGemini(hex, mood, s);
export const dissectPrompt = (t: string, s: LLMSettings) => s.activeLLM === 'ollama' ? dissectPromptOllama(t, s) : dissectPromptGemini(t, s);
export const generateFocusedVariations = (t: string, c: any, s: LLMSettings) => s.activeLLM === 'ollama' ? generateFocusedVariationsOllama(t, c, s) : generateFocusedVariationsGemini(t, c, s);
export const reconstructPrompt = (c: any, s: LLMSettings) => s.activeLLM === 'ollama' ? reconstructPromptOllama(c, s) : reconstructPromptGemini(c, s);
export const replaceComponentInPrompt = (o: string, k: string, n: string, s: LLMSettings) => s.activeLLM === 'ollama' ? replaceComponentInPromptOllama(o, k, n, s) : replaceComponentInPromptGemini(o, k, n, s);
export const reconstructFromIntent = (i: string[], s: LLMSettings) => s.activeLLM === 'ollama' ? reconstructFromIntentOllama(i, s) : reconstructFromIntentGemini(i, s);
export const abstractImage = (b64: string, len: string, target: string, s: LLMSettings) => s.activeLLM === 'ollama' ? abstractImageOllama(b64, len, target, s) : abstractImageGemini(b64, len, target, s);
export const generateArtistDescription = (name: string, s: LLMSettings) => s.activeLLM === 'ollama' ? generateArtistDescriptionOllama(name, s) : generateArtistDescriptionGemini(name, s);
export const detectSalientRegion = (b64: string, s: LLMSettings) => detectSalientRegionGemini(b64, s);
// Direct Google Media Functions
export { generateWithNanoBanana, generateWithImagen, generateWithVeo } from './geminiService';
