
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS } from "../constants";

// --- Centralized Roles (System Instructions) ---

const AI_ROLES = {
    ENHANCER: (model: string, length: string) => `Role: Professional Prompt Engineer for ${model}.
Task: Expand subject ideas into 3 high-quality, descriptive prompts.
Constraints: 
- Output EXACTLY 3 lines. One prompt per line.
- DO NOT use reasoning tags like <think> or <thought>.
- DO NOT use markdown code blocks (\`\`\`).
- DO NOT use numbering or bullets.
- DO NOT include conversational preamble.
- Desired Length: ${length}.`,

    REFINER: (model: string) => `Role: Creative Art Director & Rewrite Specialist.
Task: Improve the vocabulary, structure, and artistic detail of the provided prompt for ${model}.
Constraints:
- Output ONLY the improved prompt text.
- DO NOT use reasoning tags like <think> or <thought>.
- DO NOT use markdown.
- NO commentary or conversational filler.`,

    ANALYST: "Role: Visual Data Analyst. Task: Dissect prompts into components. Output valid JSON only. NO thoughts.",
    FORMULA_MAKER: (wildcardNames: string[]) => `Role: Template Architect.
Task: Convert a prompt into a reusable template using placeholders.
Constraints:
- Use __wildcard_name__ syntax.
- Available Categories: ${wildcardNames.join(', ')}.
- Output ONLY the template text.
- NO thoughts, NO markdown, NO preamble.`
};

// --- Utilities ---

export const cleanLLMResponse = (text: string): string => {
    let cleaned = text.trim();
    
    // Aggressively remove reasoning tags (often used by reasoning models)
    cleaned = cleaned.replace(/<(thought|think)>[\s\S]*?<\/\1>/gi, '');
    
    // Remove standalone tags if the model didn't close them properly
    cleaned = cleaned.replace(/<(thought|think)>[\s\S]*/gi, '');

    // Remove markdown code blocks and backticks
    cleaned = cleaned.replace(/```[a-z]*\n([\s\S]*?)\n```/gi, '$1');
    cleaned = cleaned.replace(/`/g, '');

    // Comprehensive list of conversational prefixes to strip
    const prefixesToRemove = [
        /^here are/i,
        /^sure,/i,
        /^certainly/i,
        /^okay/i,
        /^i have expanded/i,
        /^expanded prompts:/i,
        /^refined prompt:/i,
        /^output:/i,
        /^here is a/i
    ];

    let lines = cleaned.split('\n');
    lines = lines.map(line => {
        let l = line.trim();
        // Remove leading numbers or bullets (e.g. "1. ", "- ")
        l = l.replace(/^(\d+[\.\)]|\*|-|\+)\s+/, '');
        return l;
    }).filter(l => {
        if (!l) return false;
        // Filter out conversational lines
        return !prefixesToRemove.some(regex => regex.test(l));
    });

    return lines.join('\n').trim();
};

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

export const buildContextForEnhancer = (modifiers: PromptModifiers): string => {
    const activeMods = [];
    if (modifiers.artStyle) activeMods.push(`Style:${modifiers.artStyle}`);
    if (modifiers.artist) activeMods.push(`Artist:${modifiers.artist}`);
    if (modifiers.zImageStyle) activeMods.push(`Visual:${modifiers.zImageStyle}`);
    if (modifiers.cameraAngle) activeMods.push(`Angle:${modifiers.cameraAngle}`);
    if (modifiers.cameraProximity) activeMods.push(`Distance:${modifiers.cameraProximity}`);
    if (modifiers.cameraSettings) activeMods.push(`Options:${modifiers.cameraSettings}`);
    if (modifiers.cameraEffect) activeMods.push(`Effect:${modifiers.cameraEffect}`);
    if (modifiers.filmType) activeMods.push(`FilmType:${modifiers.filmType}`);
    if (modifiers.filmStock) activeMods.push(`FilmStock:${modifiers.filmStock}`);
    if (modifiers.motion) activeMods.push(`Motion:${modifiers.motion}`);
    if (modifiers.cameraMovement) activeMods.push(`CameraMov:${modifiers.cameraMovement}`);
    
    return activeMods.length ? `Applied Modifiers: ${activeMods.join(', ')}.` : '';
};

export const enhancePrompt = async (
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength);
    const context = buildContextForEnhancer(modifiers);
    const fullInput = [context, originalPrompt].filter(Boolean).join('\n\n');

    const rawText = settings.activeLLM === 'ollama' 
        ? await enhancePromptOllama(fullInput, constantModifier, settings, systemInstruction)
        : await enhancePromptGemini(fullInput, constantModifier, settings, systemInstruction);

    const cleanedText = cleanLLMResponse(rawText);
    const midjourneyParams = targetAIModel.toLowerCase().includes('midjourney') ? buildMidjourneyParams(modifiers) : '';
    const suggestions = cleanedText.split('\n').filter(Boolean).map(s => [s, midjourneyParams.trim()].filter(Boolean).join(' '));
    
    if (suggestions.length === 0) throw new Error("Empty response from AI.");
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
    const systemInstruction = AI_ROLES.ENHANCER(targetAIModel, promptLength);
    const context = buildContextForEnhancer(modifiers);
    const fullInput = [context, originalPrompt].filter(Boolean).join('\n\n');

    const stream = settings.activeLLM === 'ollama'
        ? enhancePromptOllamaStream(fullInput, constantModifier, settings, systemInstruction)
        : enhancePromptGeminiStream(fullInput, constantModifier, settings, systemInstruction);

    let inThought = false;
    for await (const chunk of stream) {
        // Simple heuristic to hide thoughts while streaming
        if (chunk.includes('<think') || chunk.includes('<thought')) inThought = true;
        if (chunk.includes('</think') || chunk.includes('</thought')) {
            inThought = false;
            continue;
        }
        if (!inThought) yield chunk;
    }
}

// --- Content Generation for Google Models ---

export const generateWithNanoBanana = async (prompt: string, images: string[] = []): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const imageParts = images.map(dataUrl => {
        const [meta, data] = dataUrl.split(',');
        const mimeType = meta.split(':')[1].split(';')[0];
        return {
            inlineData: {
                data: data,
                mimeType: mimeType
            }
        };
    });

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [...imageParts, { text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
    });
    
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image data returned from Nano Banana.");
};

export const generateWithImagen = async (prompt: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: { numberOfImages: 1, aspectRatio: '1:1', outputMimeType: 'image/jpeg' }
    });
    
    if (response.generatedImages?.[0]?.image?.imageBytes) {
        return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
    }
    throw new Error("No image data returned from Imagen.");
};

export const generateWithVeo = async (prompt: string, onProgress?: (msg: string) => void): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await (window as any).aistudio.openSelectKey();
        }
    }

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        const progressMessages = ["Initializing...", "Simulating...", "Refining...", "Lighting...", "Finalizing..."];
        let msgIndex = 0;

        while (!operation.done) {
            if (onProgress) {
                onProgress(progressMessages[msgIndex % progressMessages.length]);
                msgIndex++;
            }
            await new Promise(resolve => setTimeout(resolve, 8000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video generation failed.");
        
        const fetchResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await fetchResponse.blob();
        return URL.createObjectURL(blob);
    } catch (err: any) {
        if (err.message?.includes("Requested entity was not found")) {
             if (typeof window !== 'undefined' && (window as any).aistudio) {
                await (window as any).aistudio.openSelectKey();
             }
        }
        throw err;
    }
};

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings): Promise<string> => {
    const systemInstruction = AI_ROLES.REFINER(targetAIModel);
    const rawText = settings.activeLLM === 'ollama' 
        ? await refineSinglePromptOllama(promptText, settings, systemInstruction)
        : await refineSinglePromptGemini(promptText, '', settings, systemInstruction);
    
    return cleanLLMResponse(rawText);
};

export async function* refineSinglePromptStream(
    promptText: string,
    targetAIModel: string,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = AI_ROLES.REFINER(targetAIModel);
    const stream = settings.activeLLM === 'ollama'
        ? refineSinglePromptOllamaStream(promptText, settings, systemInstruction)
        : refineSinglePromptGeminiStream(promptText, '', settings, systemInstruction);

    let inThought = false;
    for await (const chunk of stream) {
        if (chunk.includes('<think') || chunk.includes('<thought')) inThought = true;
        if (chunk.includes('</think') || chunk.includes('</thought')) {
            inThought = false;
            continue;
        }
        if (!inThought) yield chunk;
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

export const generatePromptFormulaWithAI = async (promptText: string, wildcardNames: string[], settings: LLMSettings): Promise<string> => {
    const systemInstruction = AI_ROLES.FORMULA_MAKER(wildcardNames);
    if (settings.activeLLM === 'ollama') return generatePromptFormulaOllama(promptText, settings, systemInstruction);
    return generatePromptFormulaGemini(promptText, settings, systemInstruction);
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
