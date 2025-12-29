
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';
import { AVAILABLE_LLM_MODELS, TARGET_VIDEO_AI_MODELS } from "../constants";

const getGeminiClient = (settings: LLMSettings): GoogleGenAI => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API key missing.");
    return new GoogleGenAI({ apiKey });
};

const DEFAULT_MODEL = 'gemini-3-flash-preview';

export const detectSalientRegionGemini = async (
    base64ImageData: string,
    settings: LLMSettings
): Promise<{ box: [number, number, number, number] }> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        
        return await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: { parts: [imagePart] },
            config: {
                systemInstruction: "Task: Identify primary subject's box [ymin, xmin, ymax, xmax] (0-1). JSON only.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { box: { type: Type.ARRAY, items: { type: Type.NUMBER } } },
                    required: ['box'],
                },
            }
        }).then(res => JSON.parse(res.text || '{"box":[0,0,1,1]}'));
    } catch (err) {
        throw handleGeminiError(err, 'detecting region');
    }
};

export const enhancePromptGemini = async (
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: fullPrompt,
            config: { systemInstruction }
        });
        return response.text || '';
    } catch (err) {
        throw handleGeminiError(err, 'enhancing prompt');
    }
};

export async function* enhancePromptGeminiStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const response = await ai.models.generateContentStream({
            model: DEFAULT_MODEL,
            contents: fullPrompt,
            config: { systemInstruction }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) {
        throw handleGeminiError(err, 'enhancing prompt');
    }
}

export const refineSinglePromptGemini = async (promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction }
        });
        return (response.text || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'refining prompt');
    }
};

export async function* refineSinglePromptGeminiStream(promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContentStream({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) {
        throw handleGeminiError(err, 'refining prompt');
    }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  try {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: `Colors: ${hexColors.join(', ')}`,
      config: { systemInstruction: "Describe mood in 3-5 words.", temperature: 0.5 }
    });
    return (response.text || '').trim();
  } catch (err) { return "Analysis unavailable"; }
};

export const generateColorNameGemini = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Hex: ${hexColor}, Mood: ${mood}`,
            config: { systemInstruction: "One poetic 2-word name. Text only.", temperature: 0.8 }
        });
        return (response.text || '').trim().replace(/"/g, '');
    } catch (err) { return "Unnamed Color"; }
};

export const dissectPromptGemini = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: {
                systemInstruction: "Task: JSON dissect prompt into (subject, action, style, mood, composition, lighting, details).",
                responseMimeType: 'application/json',
            }
        });
        return JSON.parse(response.text || '{}');
    } catch (err) { throw handleGeminiError(err, 'dissecting'); }
};

export const generateFocusedVariationsGemini = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Prompt: ${promptText}\nKeys: ${Object.keys(components).join(',')}`,
            config: {
                systemInstruction: "Task: Generate 3 creative variations for each key. Return JSON.",
                responseMimeType: 'application/json',
            }
        });
        return JSON.parse(response.text || '{}');
    } catch (err) { throw handleGeminiError(err, 'variating'); }
};

export const reconstructPromptGemini = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: JSON.stringify(components),
            config: { systemInstruction: "Merge into one cohesive natural language prompt. No preamble." }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstructing'); }
};

export const replaceComponentInPromptGemini = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Original: ${originalPrompt}\nKey: ${componentKey}\nNewValue: ${newValue}`,
            config: { systemInstruction: "Swap value seamlessly. Keep grammar. No preamble." }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'replacing'); }
};

export const reconstructFromIntentGemini = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: intents.join(', '),
            config: { systemInstruction: "Merge intents into one descriptive prompt. No preamble." }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstructing'); }
};

export const generatePromptFormulaGemini = async (promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction: "Task: Replace nouns/styles with __placeholders__. Template only." }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'formula'); }
};

export const generateArtistDescriptionGemini = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: artistName,
            config: { systemInstruction: "Brief 1-sentence style description. No preamble.", temperature: 0.5 }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, artistName); }
};

export const abstractImageGemini = async (
    base64ImageData: string,
    promptLength: string,
    targetAIModel: string,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: { parts: [imagePart, { text: `Target: ${targetAIModel}, Length: ${promptLength}` }] },
            config: { systemInstruction: "Analyze image. Return 3 creative prompts. Newline separated. No preamble." }
        });
        const suggestions = (response.text || '').split('\n').map(s => s.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
        return { suggestions };
    } catch (err) { throw handleGeminiError(err, 'describing image'); }
};
