
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';

const getGeminiClient = (settings: LLMSettings): GoogleGenAI => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const LITE_MODEL = 'gemini-flash-lite-latest'; 

export const detectSalientRegionGemini = async (
    base64ImageData: string,
    settings: LLMSettings
): Promise<{ box: [number, number, number, number] }> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        return await ai.models.generateContent({
            model: LITE_MODEL,
            contents: { parts: [imagePart] },
            config: {
                systemInstruction: "Task: [ymin,xmin,ymax,xmax] (0-1) for subject. JSON only.",
                responseMimeType: 'application/json',
                maxOutputTokens: 30,
            }
        }).then(res => {
            try { return JSON.parse(res.text || '{"box":[0,0,1,1]}'); } 
            catch (e) { return {"box":[0,0,1,1]}; }
        });
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};

export const enhancePromptGemini = async (prompt: string, constantModifier: string, settings: LLMSettings, systemInstruction: string, length: string = 'Medium', referenceImages?: string[]): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const input = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        
        let contents: any = input;
        if (referenceImages && referenceImages.length > 0) {
            const parts: any[] = [{ text: input }];
            for (const imgBase64 of referenceImages) {
                const data = imgBase64.includes('base64,') ? imgBase64.split('base64,')[1] : imgBase64;
                parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
            }
            contents = { parts };
        }

        const tokenBudget = length === 'Long' ? 1500 : 600;
        const response = await ai.models.generateContent({
            model: settings.llmModel || DEFAULT_MODEL,
            contents,
            config: { 
                systemInstruction, 
                maxOutputTokens: tokenBudget,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text || '';
    } catch (err) { throw handleGeminiError(err, 'refining'); }
};

export async function* enhancePromptGeminiStream(prompt: string, constantModifier: string, settings: LLMSettings, systemInstruction: string, length: string = 'Medium', referenceImages?: string[]): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const input = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        
        let contents: any = input;
        if (referenceImages && referenceImages.length > 0) {
            const parts: any[] = [{ text: input }];
            for (const imgBase64 of referenceImages) {
                const data = imgBase64.includes('base64,') ? imgBase64.split('base64,')[1] : imgBase64;
                parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
            }
            contents = { parts };
        }

        const tokenBudget = length === 'Long' ? 1800 : 800;
        const response = await ai.models.generateContentStream({
            model: settings.llmModel || DEFAULT_MODEL,
            contents,
            config: { 
                systemInstruction, 
                maxOutputTokens: tokenBudget,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) { throw handleGeminiError(err, 'refining'); }
}

export const refineSinglePromptGemini = async (promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: promptText,
            config: { 
                systemInstruction, 
                maxOutputTokens: 500,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'processing'); }
};

export async function* refineSinglePromptGeminiStream(promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContentStream({
            model: settings.llmModel || DEFAULT_MODEL,
            contents: promptText,
            config: { 
                systemInstruction, 
                maxOutputTokens: 600,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) { throw handleGeminiError(err, 'processing'); }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  try {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
      model: LITE_MODEL,
      contents: `Colors: ${hexColors.join(', ')}`,
      config: { 
          systemInstruction: "Task: mood in 3 words max.", 
          temperature: 0.3, 
          maxOutputTokens: 15,
      }
    });
    return (response.text || '').trim();
  } catch (err) { return "Archive Error"; }
};

export const generateColorNameGemini = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: `Hex:${hexColor}, Mood:${mood}`,
            config: { 
                systemInstruction: "Task: Poetic 2-word name.", 
                temperature: 0.6, 
                maxOutputTokens: 10,
            }
        });
        return (response.text || '').trim().replace(/"/g, '');
    } catch (err) { return "Archived Color"; }
};

export const dissectPromptGemini = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: promptText,
            config: {
                systemInstruction: "Task: JSON dissect prompt (subject, style, mood, lighting). Output JSON.",
                responseMimeType: 'application/json',
                maxOutputTokens: 400,
            }
        });
        try { return JSON.parse(response.text || '{}'); } catch (e) { return {}; }
    } catch (err) { throw handleGeminiError(err, 'extraction'); }
};

export const generateFocusedVariationsGemini = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `Formula:${promptText}\nKeys:${Object.keys(components).join(',')}`,
            config: {
                systemInstruction: "Task: 2 variations per key. JSON only.",
                responseMimeType: 'application/json',
                maxOutputTokens: 800,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        try { return JSON.parse(response.text || '{}'); } catch (e) { return {}; }
    } catch (err) { throw handleGeminiError(err, 'processing'); }
};

export const reconstructPromptGemini = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: JSON.stringify(components),
            config: { 
                systemInstruction: "Merge into prose. Text only.", 
                maxOutputTokens: 600,
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const replaceComponentInPromptGemini = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: `Orig:${originalPrompt}\nKey:${componentKey}\nNew:${newValue}`,
            config: { 
                systemInstruction: "Swap value. Text only.", 
                maxOutputTokens: 600,
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'updating'); }
};

export const reconcileDescriptionsGemini = async (existing: string, incoming: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: `OLD:\n${existing}\n\nNEW:\n${incoming}`,
            config: { 
                systemInstruction: "Merge into cohesive paragraph. Remove redundancy. Text only.", 
                maxOutputTokens: 500,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'syncing'); }
};

export const reconstructFromIntentGemini = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: intents.join(', '),
            config: { 
                systemInstruction: "Merge into prose. Text only.", 
                maxOutputTokens: 800,
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const generatePromptFormulaGemini = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: promptText,
            config: { 
                systemInstruction, 
                maxOutputTokens: 500,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};

export const generateArtistDescriptionGemini = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: artistName,
            config: { 
                systemInstruction: "Brief style summary. Text only.", 
                temperature: 0.3, 
                maxOutputTokens: 100,
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'description'); }
};

export const abstractImageGemini = async (base64ImageData: string, promptLength: string, targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: [imagePart],
            config: { 
                systemInstruction: "Role: Visual Archeologist. Task: Deconstruct this image into a comprehensive, high-fidelity descriptive prompt. Provide 3 distinct variations of the prompt, separated by newlines. Focus on micro-textures, lighting interaction, physical materials, and atmospheric density. Output the variations ONLY. No preamble.", 
                maxOutputTokens: 1500,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        const suggestions = (response.text || '').split('\n').map(s => s.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
        return { suggestions };
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};

export const generateWithImagen = async (prompt: string, aspectRatio: string = '1:1'): Promise<string> => {
    try {
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
    } catch (err) { throw handleGeminiError(err, 'rendering'); }
};

export const generateWithNanoBanana = async (prompt: string, referenceImages: string[] = [], aspectRatio: string = '1:1'): Promise<string> => {
    try {
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
        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("Render sequence failed.");
    } catch (err) { throw handleGeminiError(err, 'rendering'); }
};

export const generateWithVeo = async (prompt: string, onStatusUpdate?: (msg: string) => void, aspectRatio: string = '16:9'): Promise<string> => {
    try {
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
        if (!downloadLink) throw new Error("Output stream lost.");
        onStatusUpdate?.('Downloading...');
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (err) { throw handleGeminiError(err, 'rendering'); }
};
