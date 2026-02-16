import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, reconcileDescriptionsGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconcileDescriptionsOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';

// --- Model-Specific Syntax (Engine Tuning) ---
const getModelSyntax = (model: string) => {
    const lower = model.toLowerCase();
    if (lower.includes('ltx-2')) return { format: "Cinematic Narrative.", rules: "Describe sequence of action with physical verbs. Continuous movement focus. High temporal consistency." };
    if (lower.includes('flux')) return { format: "Dense Descriptive.", rules: "Natural language paragraph. High visual physics detail. Focus on micro-textures, lighting interaction, and realistic skin/material rendering." };
    if (lower.includes('midjourney')) return { format: "Stylized Tags.", rules: "Focus on style, medium, and lighting. Do NOT output Midjourney --params (ar, stylize, etc) in the AI text; they are appended programmatically." };
    if (lower.includes('pony')) return { format: "Structured Tags.", rules: "Start with: score_9, score_8_up, masterpiece, followed by descriptive tags. Source tokens are mandatory." };
    if (lower.includes('veo')) return { format: "Cinematic Flow.", rules: "Fluid action, light interaction, and atmospheric density. Focus on camera motion verbs." };
    if (lower.includes('kling')) return { format: "Technical Tags & Narrative.", rules: "Mix natural language with technical lighting and physics tags. High detail on fluid dynamics and material properties." };
    if (lower.includes('runway')) return { format: "Simplified Prose.", rules: "Direct, high-impact descriptive sentences. Focus on material consistency and global illumination." };
    
    if (lower.includes('elevenlabs')) return { format: "Scripted Dialogue.", rules: "Include stage directions in [brackets] for emotional delivery." };
    if (lower.includes('mmaudio')) return { format: "Sonic Textures.", rules: "Describe layers of sound, materials clashing, and reverberation." };

    return { format: "Natural Language.", rules: "Cohesive visual description." };
};

// --- AI Roles ---
const AI_ROLES = {
    STORYBOARD_TRANSLATOR: (model: string) => {
        const syntax = getModelSyntax(model);
        return `Role: Professional Storyboard Translator for ${model}.
Task: Transform a raw scene description into a perfect prompt optimized for ${model}.
Syntax: ${syntax.format}. Rules: ${syntax.rules}.
Strategy: Analyze the user's intent, motion, and visual references. Output the translated prompt ONLY. No intros or meta-commentary.`;
    },

    ENHANCER: (model: string, length: string, isVideo: boolean, isAudio: boolean, hasManualCamera: boolean, inputType?: string) => {
        const syntax = getModelSyntax(model);
        const l = length === 'Short' ? '30 words' : length === 'Long' ? '550+ words' : '180 words';
        const isI2V = isVideo && inputType === 'i2v';

        let specificInstruction = isAudio ? 'Acoustic focus.' : isVideo ? (isI2V ? "I2V mode: High energy." : "T2V mode: High energy.") : "Visual focus.";
        
        if (isI2V) {
            specificInstruction = `I2V Protocol: The user is providing an image reference. DO NOT describe visual details (colors, textures, objects) present in the image. Focus EXCLUSIVELY on animating the scene. Describe the motion, pathing, and temporal shifts. STRIP all unnecessary static descriptive adjectives from the base concept and constant modifiers. Output should be purely kinetic and efficient.`;
        }

        return `Role: Professional Prompt Architect for ${model}.
Goal: Generate ${isAudio ? '1 script/formula' : '3 unique visual formulas'}.
Syntax: ${syntax.format}. Rules: ${syntax.rules}. Target Len: ${l}.
${specificInstruction}
Output: ${isAudio ? 'Single script' : '3 distinct lines'}. NO INTROS.`;
    },

    REFINER: (model: string, isVideo: boolean, isAudio: boolean, hasManualCamera: boolean, inputType?: string) => {
        const syntax = getModelSyntax(model);
        const isI2V = isVideo && inputType === 'i2v';
        
        let protocol = "";
        if (isI2V) {
            protocol = "I2V Protocol: Focus ONLY on motion, pathing, and temporal action. Strip all visual/static descriptions of the subject as they are in the source image. Keep it extremely simple and token-efficient.";
        }

        return `Role: Expert Prompt Refiner for ${model}. Rewrite concept into perfect ${syntax.format} formula. Rules: ${syntax.rules}. ${protocol} Output text ONLY.`;
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

export const translateStoryboardScene = async (sceneText: string, model: string, settings: LLMSettings): Promise<string> => {
    const sys = AI_ROLES.STORYBOARD_TRANSLATOR(model);
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const raw = isOllama 
        ? await refineSinglePromptOllama(sceneText, settings, sys, 1024)
        : await refineSinglePromptGemini(sceneText, '', settings, sys);
    return cleanLLMResponse(raw);
};

export const buildContextForEnhancer = (modifiers: PromptModifiers): string => {
    const ctx = [];
    
    if (modifiers.artStyle) ctx.push(`Movement: ${modifiers.artStyle}`);
    if (modifiers.artist) ctx.push(`Creator: ${modifiers.artist}`);
    if (modifiers.aestheticLook) ctx.push(`Cinematic Look: ${modifiers.aestheticLook}`);
    if (modifiers.digitalAesthetic) ctx.push(`Aesthetic: ${modifiers.digitalAesthetic}`);
    if (modifiers.zImageStyle) ctx.push(`Z-Image Variant: ${modifiers.zImageStyle}`);
    
    if (modifiers.cameraType) ctx.push(`Body: ${modifiers.cameraType}`);
    if (modifiers.cameraModel) ctx.push(`Model: ${modifiers.cameraModel}`);
    
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
    if (modifiers.audioDuration) ctx.push(`Duration: ${modifiers.audioDuration}s`);

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
    const context = buildContextForEnhancer(modifiers);
    const input = `${context}\n\n[Primary Concept]\n${originalPrompt}`;

    const tokenBudget = promptLength === 'Long' ? 2500 : 1024;
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    const stream = isOllama
        ? enhancePromptOllamaStream(input, constantModifier, settings, systemInstruction, tokenBudget)
        : enhancePromptGeminiStream(input, constantModifier, settings, systemInstruction, promptLength, referenceImages);

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

export const reconcileDescriptions = async (existing: string, incoming: string, settings: LLMSettings): Promise<string> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? reconcileDescriptionsOllama(existing, incoming, settings)
        : reconcileDescriptionsGemini(existing, incoming, settings);
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

export const dissectPrompt = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    const isOllama = settings.activeLLM === 'ollama' || settings.activeLLM === 'ollama_cloud';
    return isOllama
        ? dissectPromptOllama(promptText, settings)
        : dissectPromptGemini(promptText, settings);
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

export const generateWithImagen = async (prompt: string, aspectRatio: string = '1:1'): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio as any,
        },
    });
    const base64EncodeString: string = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${base64EncodeString}`;
};

export const generateWithNanoBanana = async (prompt: string, referenceImages: string[] = [], aspectRatio: string = '1:1'): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = [{ text: prompt }];
    for (const imgBase64 of referenceImages) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: imgBase64.split(',')[1] || imgBase64 } });
    }
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { imageConfig: { aspectRatio: aspectRatio as any } }
    });
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("Render sequence failed.");
};

export const generateWithVeo = async (prompt: string, onStatusUpdate?: (msg: string) => void, aspectRatio: string = '16:9'): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let finalAspectRatio = aspectRatio;
    if (finalAspectRatio !== '16:9' && finalAspectRatio !== '9:16') finalAspectRatio = '16:9';
    onStatusUpdate?.('Initializing...');
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: finalAspectRatio as any }
    });
    while (!operation.done) {
        onStatusUpdate?.('Processing...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Output lost.");
    onStatusUpdate?.('Downloading...');
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
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
            targetUrl = '/ollama-local';
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