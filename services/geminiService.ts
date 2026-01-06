
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';

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
                systemInstruction: "Task: Output [ymin,xmin,ymax,xmax] (0-1) for primary subject. JSON only.",
                responseMimeType: 'application/json',
                maxOutputTokens: 60,
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { box: { type: Type.ARRAY, items: { type: Type.NUMBER } } },
                    required: ['box'],
                },
            }
        }).then(res => JSON.parse(res.text || '{"box":[0,0,1,1]}'));
    } catch (err) { throw handleGeminiError(err, 'detecting region'); }
};

export const enhancePromptGemini = async (prompt: string, constantModifier: string, settings: LLMSettings, systemInstruction: string, length: string = 'Medium'): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const input = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const tokenBudget = length === 'Long' ? 2500 : 800;
        const response = await ai.models.generateContent({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: input,
            config: { systemInstruction, maxOutputTokens: tokenBudget }
        });
        return response.text || '';
    } catch (err) { throw handleGeminiError(err, 'enhancing prompt'); }
};

export async function* enhancePromptGeminiStream(prompt: string, constantModifier: string, settings: LLMSettings, systemInstruction: string, length: string = 'Medium'): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const input = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const tokenBudget = length === 'Long' ? 3000 : 1000;
        const response = await ai.models.generateContentStream({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: input,
            config: { systemInstruction, maxOutputTokens: tokenBudget }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) { throw handleGeminiError(err, 'enhancing prompt'); }
}

export const refineSinglePromptGemini = async (promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction, maxOutputTokens: 1000 }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'refining prompt'); }
};

export async function* refineSinglePromptGeminiStream(promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContentStream({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction, maxOutputTokens: 1200 }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) { throw handleGeminiError(err, 'refining prompt'); }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  try {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: `Colors: ${hexColors.join(', ')}`,
      config: { systemInstruction: "Output mood in 3-5 words.", temperature: 0.5, maxOutputTokens: 30 }
    });
    return (response.text || '').trim();
  } catch (err) { return "Analysis unavailable"; }
};

export const generateColorNameGemini = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Hex:${hexColor}, Mood:${mood}`,
            config: { systemInstruction: "Output one poetic 2-word name. Text only.", temperature: 0.8, maxOutputTokens: 20 }
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
                systemInstruction: "Task: JSON dissect prompt into keys (subject, action, style, mood, composition, lighting, details).",
                responseMimeType: 'application/json',
                maxOutputTokens: 500
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
            contents: `Prompt:${promptText}\nKeys:${Object.keys(components).join(',')}`,
            config: {
                systemInstruction: "Task: Output 3 creative variations per key. JSON only.",
                responseMimeType: 'application/json',
                maxOutputTokens: 1000
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
            config: { systemInstruction: "Merge into cohesive natural prose. No preamble.", maxOutputTokens: 800 }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstructing'); }
};

export const replaceComponentInPromptGemini = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Orig:${originalPrompt}\nKey:${componentKey}\nNew:${newValue}`,
            config: { systemInstruction: "Swap value seamlessly. No preamble.", maxOutputTokens: 800 }
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
            config: { systemInstruction: "Merge intents into descriptive prose. No preamble.", maxOutputTokens: 1000 }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstructing'); }
};

export const generatePromptFormulaGemini = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: { systemInstruction, maxOutputTokens: 600 }
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
            config: { systemInstruction: "Brief 1-sentence style description. No preamble.", temperature: 0.5, maxOutputTokens: 150 }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, artistName); }
};

export const abstractImageGemini = async (base64ImageData: string, promptLength: string, targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: { parts: [imagePart, { text: `Target:${targetAIModel}, Len:${promptLength}` }] },
            config: { systemInstruction: "Analyze image. Return 3 prompts. Newline-sep. No preamble.", maxOutputTokens: 1500 }
        });
        const suggestions = (response.text || '').split('\n').map(s => s.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
        return { suggestions };
    } catch (err) { throw handleGeminiError(err, 'describing image'); }
};

// --- Media Generation Functions ---

export const generateWithNanoBanana = async (prompt: string, referenceImages: string[] = []): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API key missing.");
        const ai = new GoogleGenAI({ apiKey });
        const parts: any[] = [{ text: prompt }];
        if (referenceImages && referenceImages.length > 0) {
            referenceImages.forEach(img => {
                const data = img.includes('base64,') ? img.split('base64,')[1] : img;
                const mimeType = img.match(/data:(.*?);/)?.[1] || 'image/jpeg';
                parts.push({ inlineData: { data, mimeType } });
            });
        }
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        if (!response.candidates?.[0]?.content?.parts) throw new Error("No image generated.");
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        throw new Error("No image data found.");
    } catch (err) { throw handleGeminiError(err, 'generating image'); }
};

export const generateWithImagen = async (prompt: string): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API key missing.");
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: { numberOfImages: 1, aspectRatio: '1:1' },
        });
        if (!response.generatedImages || response.generatedImages.length === 0) throw new Error("No image generated.");
        return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
    } catch (err) { throw handleGeminiError(err, 'generating image'); }
};

export const generateWithVeo = async (prompt: string, onProgress?: (msg: string) => void): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API key missing.");
        const ai = new GoogleGenAI({ apiKey });
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video generation failed.");
        const vidResponse = await fetch(`${downloadLink}&key=${apiKey}`);
        if (!vidResponse.ok) throw new Error(`Failed to download video.`);
        const blob = await vidResponse.blob();
        return URL.createObjectURL(blob);
    } catch (err) { throw handleGeminiError(err, 'generating video'); }
};
