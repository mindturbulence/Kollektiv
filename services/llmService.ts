
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS } from "../constants";

import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';
import { loadCheatsheet } from '../utils/cheatsheetStorage';

let artStylesCache: CheatsheetCategory[] | null = null;
let artistsCache: CheatsheetCategory[] | null = null;
let generalCheatsheetCache: CheatsheetCategory[] | null = null;

export const testOllamaConnection = async (baseUrl: string): Promise<boolean> => {
  if (!baseUrl || !baseUrl.startsWith('http')) return false;
  try {
    const response = await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch (e) { return false; }
};

export const buildMidjourneyParams = (modifiers: PromptModifiers): string => {
    const params: string[] = [];
    if (modifiers.mjNo) params.push(`--no ${modifiers.mjNo}`);
    if (modifiers.mjAspectRatio) params.push(`--ar ${modifiers.mjAspectRatio}`);
    if (modifiers.mjChaos && parseInt(modifiers.mjChaos, 10) > 0) params.push(`--chaos ${modifiers.mjChaos}`);
    if (modifiers.mjQuality && modifiers.mjQuality !== '1') params.push(`--q ${modifiers.mjQuality}`);
    if (modifiers.mjRepeat && parseInt(modifiers.mjRepeat, 10) > 1) params.push(`--repeat ${modifiers.mjRepeat}`);
    if (modifiers.mjSeed) params.push(`--seed ${modifiers.mjSeed}`);
    if (modifiers.mjStop && parseInt(modifiers.mjStop, 10) < 100) params.push(`--stop ${modifiers.mjStop}`);
    if (modifiers.mjStyle) params.push(`--style ${modifiers.mjStyle}`);
    if (modifiers.mjStylize && parseInt(modifiers.mjStylize, 10) > 0) params.push(`--stylize ${modifiers.mjStylize}`);
    if (modifiers.mjTile) params.push(`--tile`);
    if (modifiers.mjWeird && parseInt(modifiers.mjWeird, 10) > 0) params.push(`--weird ${modifiers.mjWeird}`);
    if (modifiers.mjNiji) params.push(`--niji ${modifiers.mjNiji}`);
    else if (modifiers.mjVersion) params.push(`--v ${modifiers.mjVersion}`);
    return params.join(' ');
};

export const buildSystemInstructionForEnhancer = (
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers
): string => {
    const isVideo = TARGET_VIDEO_AI_MODELS.includes(targetAIModel);
    const target = targetAIModel.toLowerCase();

    let base = `Act as Prompt Expert. Generate 3 vivid prompts for ${targetAIModel}. No preamble. Newline separated.
Length: ${promptLength}. Keep subject. Use modifiers.\n`;

    if (isVideo) {
        if (target.includes('hunyuan')) {
            base += "Hunyuan Recipe: [Subject] + [Environment] + [Camera] + [Style] + [Lighting] + [Motion].\n";
            base += "Mandatory Style Keywords: '8k resolution', 'extremely high detail', 'professional cinematography', 'cinematic lighting'.\n";
            base += "Motion: Describe specific action sequence. Camera: Describe angle and movement.\n";
        } else if (target.includes('wan')) {
            base += "WAN 2.5: Detailed visual motion + sound effects/audio atmosphere description.\n";
        } else {
            base += "Video: Structure with camera work, lighting, and action in brackets [].\n";
        }
    } else {
        if (target.includes('flux')) base += "FLUX: Descriptive natural language prose.\n";
        else if (target.includes('pony')) base += "Pony: Start with 'score_9, score_8_up, source_anime'.\n";
    }
    
    if (modifiers.artStyle) base += `Style: ${modifiers.artStyle}. `;
    if (modifiers.artist) base += `Artist: ${modifiers.artist}. `;
    if (modifiers.zImageStyle) base += `Z-Image Visual Aesthetic: ${modifiers.zImageStyle}. `;
    if (modifiers.motion) base += `Motion Context: ${modifiers.motion}. `;
    if (modifiers.cameraMovement) base += `Camera Movement: ${modifiers.cameraMovement}. `;
    return base;
};

export const enhancePrompt = async (
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    const systemInstruction = buildSystemInstructionForEnhancer(promptLength, targetAIModel, modifiers);
    const text = settings.activeLLM === 'ollama' 
        ? await enhancePromptOllama(originalPrompt, constantModifier, settings, systemInstruction)
        : await enhancePromptGemini(originalPrompt, constantModifier, settings, systemInstruction);

    const midjourneyParams = targetAIModel.toLowerCase().includes('midjourney') ? buildMidjourneyParams(modifiers) : '';
    const suggestions = text.split('\n').map(s => s.trim().replace(/^\d+\.\s*/, '')).filter(Boolean).map(s => [s, midjourneyParams.trim()].filter(Boolean).join(' '));
    if (suggestions.length === 0) throw new Error("Empty response.");
    return { suggestions };
};

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = buildSystemInstructionForEnhancer(promptLength, targetAIModel, modifiers);
    if (settings.activeLLM === 'ollama') {
        for await (const chunk of enhancePromptOllamaStream(originalPrompt, constantModifier, settings, systemInstruction)) yield chunk;
    } else {
        for await (const chunk of enhancePromptGeminiStream(originalPrompt, constantModifier, settings, systemInstruction)) yield chunk;
    }
}

const buildSystemInstructionForRefiner = async (targetAIModel: string) => {
    if (!artStylesCache || !artistsCache || !generalCheatsheetCache) {
        const [artStyles, artists, generalCheatsheet] = await Promise.all([loadArtStyles(), loadArtists(), loadCheatsheet()]);
        artStylesCache = artStyles; artistsCache = artists; generalCheatsheetCache = generalCheatsheet;
    }
    
    const cheatsheetData = [
        { n: 'Style', i: (artStylesCache || []).flatMap(c => c.items.map(i => i.name)).slice(0, 8) },
        { n: 'Artist', i: (artistsCache || []).flatMap(c => c.items.map(i => i.name)).slice(0, 8) },
        ...(generalCheatsheetCache || []).slice(0, 4).map(c => ({ n: c.category, i: c.items.map(i => i.name).slice(0, 8) }))
    ];

    let context = "Ref: " + cheatsheetData.map(s => `${s.n}[${s.i.join(',')}]`).join('; ') + "\n";
    const target = targetAIModel.toLowerCase();
    let targetInstr = `Model: ${targetAIModel}. `;
    
    if (TARGET_VIDEO_AI_MODELS.includes(targetAIModel)) {
        if (target.includes('hunyuan')) {
            targetInstr += "Strict Recipe: [Subject] + [Environment] + [Camera] + [Style] + [Lighting] + [Motion]. Use keywords: '8k resolution', 'extremely high detail'.";
        } else {
            targetInstr += "Video: Focus on action continuity and camera movement.";
        }
    }

    return `Expert Rewrite for ${targetAIModel}. One result. No preamble.\n${targetInstr}\n${context}`;
};

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings): Promise<string> => {
    const systemInstruction = await buildSystemInstructionForRefiner(targetAIModel);
    if (settings.activeLLM === 'ollama') return refineSinglePromptOllama(promptText, settings, systemInstruction);
    return refineSinglePromptGemini(promptText, '', settings, systemInstruction);
};

export async function* refineSinglePromptStream(
    promptText: string,
    targetAIModel: string,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = await buildSystemInstructionForRefiner(targetAIModel);
    if (settings.activeLLM === 'ollama') {
        for await (const chunk of refineSinglePromptOllamaStream(promptText, settings, systemInstruction)) yield chunk;
    } else {
        for await (const chunk of refineSinglePromptGeminiStream(promptText, '', settings, systemInstruction)) yield chunk;
    }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return analyzePaletteMoodOllama(hexColors, settings);
    return analyzePaletteMoodGemini(hexColors, settings);
};

export const generateColorName = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return generateColorNameOllama(hexColor, mood, settings);
    return generateColorNameGemini(hexColor, mood, settings);
};

export const dissectPrompt = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    if (settings.activeLLM === 'ollama') return dissectPromptOllama(promptText, settings);
    return dissectPromptGemini(promptText, settings);
};

export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    if (settings.activeLLM === 'ollama') return generateFocusedVariationsOllama(promptText, components, settings);
    return generateFocusedVariationsGemini(promptText, components, settings);
};

export const reconstructPrompt = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return reconstructPromptOllama(components, settings);
    return reconstructPromptGemini(components, settings);
};

export const replaceComponentInPrompt = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return replaceComponentInPromptOllama(originalPrompt, componentKey, newValue, settings);
    return replaceComponentInPromptGemini(originalPrompt, componentKey, newValue, settings);
};

export const reconstructFromIntent = async (intents: string[], settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return reconstructFromIntentOllama(intents, settings);
    return reconstructFromIntentGemini(intents, settings);
};

export const generatePromptFormulaWithAI = async (promptText: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return generatePromptFormulaOllama(promptText, settings);
    return generatePromptFormulaGemini(promptText, settings);
};

export const abstractImage = async (
    base64ImageData: string,
    promptLength: string,
    targetAIModel: string,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    if (settings.activeLLM === 'ollama') return abstractImageOllama(base64ImageData, promptLength, targetAIModel, settings);
    return abstractImageGemini(base64ImageData, promptLength, targetAIModel, settings);
};

export const generateArtistDescription = async (artistName: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') return generateArtistDescriptionOllama(artistName, settings);
    return generateArtistDescriptionGemini(artistName, settings);
};

export const detectSalientRegion = async (base64ImageData: string, settings: LLMSettings): Promise<{ box: [number, number, number, number] }> => {
    return detectSalientRegionGemini(base64ImageData, settings);
};
