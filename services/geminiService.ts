
import { GoogleGenAI } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings } from '../types';

const getGeminiClient = (_settings: LLMSettings): GoogleGenAI => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Please ensure it is set in your environment.");
    }
    return new GoogleGenAI({ apiKey });
};

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const LITE_MODEL = 'gemini-3.1-flash-lite-preview'; 

export async function* enhancePromptGeminiStream(prompt: string, constantModifier: string, settings: LLMSettings, systemInstruction: string, length: string = 'Medium', referenceImages?: string[], temperature: number = 0.7): AsyncGenerator<string> {
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
                temperature,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        for await (const chunk of response) yield chunk.text || '';
    } catch (err) { throw handleGeminiError(err, 'refining'); }
}

export const refineSinglePromptGemini = async (promptText: string, _cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
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

export async function* refineSinglePromptGeminiStream(promptText: string, _cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
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

export const dissectPromptGemini = async (promptText: string, settings: LLMSettings, modifierCatalog?: string): Promise<{ [key: string]: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: promptText,
            config: {
                systemInstruction: `Task: JSON dissect prompt into descriptive components.
${modifierCatalog ? `[AVAILABLE MODIFIERS CATALOG]\n${modifierCatalog}\n\nSTRICT RULE: You MUST prioritize mapping components to the categories and values provided in the catalog above if a match or close synonym is found.
- Use the EXACT category name (the word before the colon in the catalog) as the JSON key.
- Use the EXACT value from the catalog as the JSON value.
- IMPORTANT: Be aggressive in splitting modifiers (like camera angles, lighting, styles) away from the core subject. The "Subject" or "Prompt Idea" field should ONLY contain the core entity and its primary action. All stylistic, technical, or environmental details MUST be moved to their respective categories or a new descriptive key.` : 'Identify subject, style, mood, lighting, etc.'}
If a component does not fit an existing category, create a descriptive key for it.
Output JSON ONLY.`,
                responseMimeType: 'application/json',
                maxOutputTokens: 600,
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

export const reconstructFromIntentGemini = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: `Components: ${intents.join(' | ')}`,
            config: { 
                systemInstruction: "Task: Consolidate the provided visual components and descriptive intents into a single, cohesive, high-fidelity visual prompt. Remove redundancies. Ensure a logical flow from subject to environment to artistic style. Output the prompt text ONLY. No preamble.", 
                maxOutputTokens: 1000,
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const translateToEnglishGemini = async (text: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: LITE_MODEL,
            contents: text,
            config: { 
                systemInstruction: "Role: Polyglot Translator. Task: Translate the input text into professional, clear English. If the text is already in English, refine its clarity and impact. Output the translated/refined English text ONLY. No explanations.", 
                maxOutputTokens: 1200,
                temperature: 0.3
            }
        });
        return (response.text || '').trim();
    } catch (err) { throw handleGeminiError(err, 'translation'); }
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

export const abstractImageGemini = async (base64ImageData: string, _promptLength: string, _targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
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
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: aspectRatio as any,
            },
        });
        const base64EncodeString = response.generatedImages?.[0]?.image?.imageBytes;
        if (!base64EncodeString) throw new Error("Image generation failed: No image data returned.");
        return `data:image/png;base64,${base64EncodeString}`;
    } catch (err) { throw handleGeminiError(err, 'rendering'); }
};

export const generateWithNanoBanana = async (prompt: string, referenceImages: string[] = [], aspectRatio: string = '1:1'): Promise<string> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
        const ai = new GoogleGenAI({ apiKey });
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
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
        const ai = new GoogleGenAI({ apiKey });
        let finalAspectRatio = aspectRatio;
        if (finalAspectRatio !== '16:9' && finalAspectRatio !== '9:16') finalAspectRatio = '16:9';
        onStatusUpdate?.('Initializing...');
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-lite-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: finalAspectRatio as any }
        });
        while (!operation.done) {
            onStatusUpdate?.('Processing...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Output stream lost.");
        onStatusUpdate?.('Downloading...');
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (err) { throw handleGeminiError(err, 'rendering'); }
};

export const generateConstructorPresetGemini = async (components: { [key: string]: string }, settings: LLMSettings, modifierCatalog?: string): Promise<{ prompt: string, modifiers: any, constantModifier?: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: JSON.stringify(components),
            config: {
                systemInstruction: `Role: Prompt Constructor Architect. 
Task: Deconstruct the analyzed prompt components into a "Prompt Idea" (base subject/intent), "Active Construction Items" (mapped modifiers), and "Constant Modifiers" (unmapped details).

Mapping Protocol:
1. Identify components that match or are highly similar to these Refiner categories:
   - artStyle, artist, photographyStyle, aestheticLook, digitalAesthetic, aspectRatio, cameraType, cameraAngle, cameraProximity, cameraSettings, cameraEffect, specialtyLens, lensType, filmType, filmStock, lighting, composition, facialExpression, hairStyle, eyeColor, skinTexture, clothing, motion, cameraMovement, mjVersion, mjNiji, mjAspectRatio, zImageStyle

${modifierCatalog ? `[AVAILABLE MODIFIERS CATALOG]\n${modifierCatalog}\n\nSTRICT RULE: You MUST prioritize mapping to the values provided in the catalog above if a match or close synonym is found.` : ''}

2. Extraction Logic:
   - If a component key or value matches a category or value from the [AVAILABLE MODIFIERS CATALOG], it MUST be moved to the "modifiers" object.
   - If a component matches both a category AND a specific value from the [AVAILABLE MODIFIERS CATALOG] (allow for minor variations in spacing or hyphens during matching), add it to the "modifiers" object using the category key and the EXACT value from the catalog.
   - If a component matches a category but the specific value is NOT in the catalog, or if it's a stylistic/technical modifier that doesn't fit any category, add it to the "constantModifier" string.
   - The core subject, action, or unique narrative detail goes into the "prompt" (Prompt Idea).
   - IMPORTANT: The "prompt" (Prompt Idea) MUST NOT contain any information that is already captured in "modifiers" or "constantModifier". You MUST aggressively strip all stylistic, technical, and atmospheric modifiers from the "prompt" field. The "prompt" should be the pure subject and narrative intent ONLY.
   - Example: If the input is {"Subject": "A cat in a garden", "cameraProximity": "Close-Up"}, the output MUST be {"prompt": "A cat in a garden", "modifiers": {"cameraProximity": "Close-Up"}}. 
   - Example: If the input is {"Subject": "A portrait of a man, Close Up, cinematic lighting"}, the output MUST be {"prompt": "A portrait of a man", "modifiers": {"cameraProximity": "Close-Up", "lighting": "Cinematic Lighting"}}.
   - The "prompt" should be a clean, cohesive base description.

Output: A JSON object:
{
  "prompt": "The core subject/intent (Prompt Idea)",
  "modifiers": { "categoryKey": "Value", ... },
  "constantModifier": "Comma-separated list of unmapped modifiers"
}
Only include relevant modifiers. Output JSON ONLY.`,
                responseMimeType: 'application/json',
                maxOutputTokens: 1000,
            }
        });
        try { 
            const result = JSON.parse(response.text || '{}');
            return {
                prompt: result.prompt || '',
                modifiers: result.modifiers || {},
                constantModifier: result.constantModifier || ''
            };
        } catch (e) { 
            return { prompt: '', modifiers: {}, constantModifier: '' }; 
        }
    } catch (err) { throw handleGeminiError(err, 'processing'); }
};
