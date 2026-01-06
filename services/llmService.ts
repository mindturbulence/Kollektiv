
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';

// --- Model-Specific Reference Logic ---
const getModelSyntax = (model: string) => {
    const lower = model.toLowerCase();
    
    if (lower.includes('pony') || lower.includes('illustrious')) {
        return {
            format: "Comma-separated tags + Scoring system.",
            prefix: "score_9, score_8_up, score_7_up, rating_safe, source_anime, ",
            rules: "Start with quality scores. Use specific descriptive tags. NO prose sentences. Use underscores for multi-word tags (e.g., long_hair)."
        };
    }
    
    if (lower.includes('stable diffusion') || lower.includes('sd 1.5') || lower.includes('sdxl')) {
        return {
            format: "Weighted keywords and descriptive phrases.",
            prefix: "masterpiece, best quality, ultra-detailed, ",
            rules: "Focus on subject, then style, then lighting. Use (parentheses:1.2) for emphasis on the most important keywords."
        };
    }

    if (lower.includes('flux') || lower.includes('midjourney') || lower.includes('imagen') || lower.includes('dall-e')) {
        return {
            format: "Sophisticated natural language narrative.",
            prefix: "",
            rules: "Write in a cohesive, evocative paragraph. Describe the 'physics' of the scene: light bounce, material textures, and depth. Avoid generic buzzwords like '4k'."
        };
    }

    return {
        format: "Descriptive prose or tags as appropriate.",
        prefix: "",
        rules: "Clearly describe the visual elements requested."
    };
};

// --- Token-Efficient & Model-Aware Roles ---
const AI_ROLES = {
    ENHANCER: (model: string, length: string) => {
        const syntax = getModelSyntax(model);
        const lengthGuides = {
            'Short': 'approx 15-20 words.',
            'Medium': 'approx 50-70 words.',
            'Long': '200-300 words. Exhaustive technical and sensory depth.'
        };
        const guide = lengthGuides[length as keyof typeof lengthGuides] || lengthGuides['Medium'];

        return `Role: Kollektiv Premier Prompt Engineer for ${model}.
Target System Syntax: ${syntax.format}
Official Reference Rules: ${syntax.rules}

TASK: Expand the SUBJECT into 3 unique variations.
MANDATORY: 
- Prepend this EXACT prefix to every result: "${syntax.prefix}"
- Detail Level [${length}]: Each result MUST be ${guide}
- Output EXACTLY 3 lines. One result per line. 
- NO reasoning, NO markdown, NO conversational text.`;
    },

    REFINER: (model: string) => {
        const syntax = getModelSyntax(model);
        return `Role: Art Director for ${model}. 
Task: Re-write the input into optimized ${syntax.format} according to these official rules: ${syntax.rules}.
Requirement: Prepend "${syntax.prefix}" if necessary. Output ONLY the improved text.`;
    },

    ANALYST: "Task: JSON dissect prompt into keys: subject, action, style, mood, composition, lighting, details. Output JSON only.",
    FORMULA_MAKER: (wildcardNames: string[]) => `Task: Replace terms with __wildcard__ placeholders. 
Available: ${wildcardNames.slice(0, 50).join(', ')}. 
Constraint: Output template ONLY.`
};

export const cleanLLMResponse = (text: string): string => {
    let cleaned = text.replace(/<(think|thought)>[\s\S]*?(<\/\1>|$)/gi, '').trim();
    cleaned = cleaned.replace(/```[a-z]*\n([\s\S]*?)\n```/gi, '$1').replace(/`/g, '');
    
    const stopWords = [/^here/i, /^sure/i, /^certainly/i, /^expanded/i, /^refined/i, /^output/i, /^okay/i, /^suggestion/i, /^the following/i, /^result/i];
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
    if (modifiers.zImageStyle) ctx.push(`Visual Aesthetic: ${modifiers.zImageStyle}`);
    if (modifiers.photographyStyle) ctx.push(`Photo Style: ${modifiers.photographyStyle}`);
    if (modifiers.cameraAngle) ctx.push(`Angle: ${modifiers.cameraAngle}`);
    if (modifiers.cameraProximity) ctx.push(`Distance: ${modifiers.cameraProximity}`);
    if (modifiers.lighting) ctx.push(`Lighting: ${modifiers.lighting}`);
    if (modifiers.composition) ctx.push(`Composition: ${modifiers.composition}`);
    if (modifiers.filmStock) ctx.push(`Film: ${modifiers.filmStock}`);
    
    return ctx.length ? `[REQUIRED MODIFIERS]\n${ctx.join('\n')}` : '';
};

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength);
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

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings): Promise<string> => {
    const sys = AI_ROLES.REFINER(targetAIModel);
    const raw = settings.activeLLM === 'ollama' 
        ? await refineSinglePromptOllama(promptText, settings, sys)
        : await refineSinglePromptGemini(promptText, '', settings, sys);
    return cleanLLMResponse(raw);
};

export async function* refineSinglePromptStream(
    promptText: string,
    targetAIModel: string,
    settings: LLMSettings
): AsyncGenerator<string> {
    const sys = AI_ROLES.REFINER(targetAIModel);
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
