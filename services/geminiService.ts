
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';
import { AVAILABLE_LLM_MODELS, TARGET_VIDEO_AI_MODELS } from "../constants";

const getGeminiClient = (settings: LLMSettings): GoogleGenAI => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API key missing.");
    return new GoogleGenAI({ apiKey });
};

export const detectSalientRegionGemini = async (
    base64ImageData: string,
    settings: LLMSettings
): Promise<{ box: [number, number, number, number] }> => {
    try {
        const ai = getGeminiClient(settings);
        const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64ImageData } };
        
        return await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [imagePart] },
            config: {
                systemInstruction: "Identify the primary subject's bounding box in [y_min, x_min, y_max, x_max] format (0.0 to 1.0). Return JSON only.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        box: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                    },
                    required: ['box'],
                },
            }
        }).then(res => JSON.parse(res.text));
    } catch (err) {
        throw handleGeminiError(err, 'detecting salient region');
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
            model: 'gemini-3-flash-preview',
            contents: fullPrompt,
            config: { systemInstruction }
        });
        return response.text;
    } catch (err) {
        throw handleGeminiError(err, 'enhancing your prompt');
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
            model: 'gemini-3-flash-preview',
            contents: fullPrompt,
            config: { systemInstruction }
        });
        for await (const chunk of response) yield chunk.text;
    } catch (err) {
        throw handleGeminiError(err, 'enhancing your prompt');
    }
}

export const refineSinglePromptGemini = async (promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptText,
            config: { systemInstruction }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt');
    }
};

export async function* refineSinglePromptGeminiStream(promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents: promptText,
            config: { systemInstruction }
        });
        for await (const chunk of response) yield chunk.text;
    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt');
    }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  try {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Mood for palette: ${hexColors.join(', ')}`,
      config: { systemInstruction: "Describe the mood in 3-5 evocative words.", temperature: 0.5 }
    });
    return response.text.trim();
  } catch (err) {
    return "Analysis unavailable";
  }
};

export const generateColorNameGemini = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Color: ${hexColor}, Mood: ${mood}`,
            config: { systemInstruction: "Generate one creative, poetic 2-3 word name for this color. Return only the name.", temperature: 0.8 }
        });
        return response.text.trim().replace(/"/g, '');
    } catch (err) {
        return "Unnamed Color";
    }
};

export const dissectPromptGemini = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptText,
            config: {
                systemInstruction: "Dissect prompt into components (subject, action, style, etc). Return JSON object only.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        subject: { type: Type.STRING },
                        action: { type: Type.STRING },
                        setting: { type: Type.STRING },
                        style: { type: Type.STRING },
                        mood: { type: Type.STRING },
                        composition: { type: Type.STRING },
                        lighting: { type: Type.STRING },
                        details: { type: Type.STRING }
                    }
                }
            }
        });
        // Fix: Changed res.text to response.text
        return JSON.parse(response.text);
    } catch (err) {
        throw handleGeminiError(err, 'dissecting your prompt');
    }
};

export const generateFocusedVariationsGemini = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        const ai = getGeminiClient(settings);
        const properties: { [key: string]: any } = {};
        for (const key in components) properties[key] = { type: Type.ARRAY, items: { type: Type.STRING } };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Prompt: "${promptText}", Components: ${JSON.stringify(components)}`,
            config: {
                systemInstruction: "Generate 3 creative variations for each provided component. Return JSON only.",
                responseMimeType: 'application/json',
                responseSchema: { type: Type.OBJECT, properties }
            }
        });
        return JSON.parse(response.text);
    } catch (err) {
        throw handleGeminiError(err, 'generating focused variations');
    }
};

export const reconstructPromptGemini = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Components: ${JSON.stringify(components)}`,
            config: { systemInstruction: "Reconstruct a cohesive natural language prompt from these components. Return text only." }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing your prompt');
    }
};

export const replaceComponentInPromptGemini = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Prompt: "${originalPrompt}", Replace "${componentKey}" with "${newValue}"`,
            config: { systemInstruction: "Seamlessly replace the component in the prompt while maintaining grammar and tone. Return text only." }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'replacing a prompt component');
    }
};

export const reconstructFromIntentGemini = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Intents: ${intents.join(', ')}`,
            config: { systemInstruction: "Weave these intents into one descriptive natural language prompt. Return text only." }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing from intent');
    }
};

export const generatePromptFormulaGemini = async (promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptText,
            config: { systemInstruction: "Convert prompt to a template using __placeholder__ syntax for core components. Return template only." }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'generating a prompt formula');
    }
};

export const generateArtistDescriptionGemini = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Artist: ${artistName}`,
            config: { systemInstruction: "Describe artist's signature style in one brief sentence. No preamble.", temperature: 0.5 }
        });
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, `generating description for ${artistName}`);
    }
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
        const textPart = { text: `Target: ${targetAIModel}, Length: ${promptLength}` };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [imagePart, textPart] },
            config: { systemInstruction: "Analyze image. Generate 3 creative prompts for the target AI. Newline separated. No preamble." }
        });
        
        const suggestions = response.text.split('\n').map(s => s.trim().replace(/^\s*\d+\.\s*/, '')).filter(Boolean);
        if (suggestions.length === 0) throw new Error("Empty response.");
        return { suggestions };
    } catch (err) {
        throw handleGeminiError(err, 'describing your image');
    }
};
