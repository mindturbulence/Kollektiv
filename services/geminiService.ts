


import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { handleGeminiError } from '../utils/errorHandler';
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';
import { AVAILABLE_LLM_MODELS, TARGET_VIDEO_AI_MODELS } from "../constants";

// --- Gemini Specific Helpers ---

const getGeminiClient = (settings: LLMSettings): GoogleGenAI => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("The Gemini API key is missing. Please provide it in Settings.");
    }
    return new GoogleGenAI({ apiKey });
};

// --- Exported Gemini API Functions ---

export const detectSalientRegionGemini = async (
    base64ImageData: string,
    settings: LLMSettings
): Promise<{ box: [number, number, number, number] }> => {
    try {
        const ai = getGeminiClient(settings);

        const systemInstruction = `You are an expert computer vision model. Your task is to identify the single most important subject or region of interest in an image. Return the bounding box coordinates of this region as a JSON object. The coordinates must be normalized percentages (from 0.0 to 1.0). The format is [y_min, x_min, y_max, x_max]. For example, a box covering the top-left quadrant would be [0.0, 0.0, 0.5, 0.5]. A centrally located subject might be [0.25, 0.25, 0.75, 0.75]. Return only the JSON object.`;

        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg', // Assuming jpeg, could be dynamic
                data: base64ImageData,
            },
        };

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                box: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                    description: "An array of four numbers representing the bounding box: [y_min, x_min, y_max, x_max], normalized from 0.0 to 1.0."
                },
            },
            required: ['box'],
        };
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart] },
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema,
            }
        });

        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        
        // Validate the box format
        if (Array.isArray(parsed.box) && parsed.box.length === 4 && parsed.box.every(n => typeof n === 'number')) {
            return parsed;
        } else {
            throw new Error("Invalid bounding box format received from Gemini.");
        }
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

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: settings.llmModel,
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
            }
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
            model: settings.llmModel,
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
            }
        });

        for await (const chunk of response) {
            yield chunk.text;
        }
    } catch (err) {
        throw handleGeminiError(err, 'enhancing your prompt');
    }
}

export const refineSinglePromptGemini = async (promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: promptText,
            config: {
                systemInstruction,
            }
        });

        const text = response.text.trim();
        if (!text) {
            throw new Error("The AI returned an empty response for the refinement.");
        }
        
        return text;

    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt');
    }
};

export async function* refineSinglePromptGeminiStream(promptText: string, cheatsheetContext: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const ai = getGeminiClient(settings);
        
        const response = await ai.models.generateContentStream({
            model: settings.llmModel,
            contents: promptText,
            config: {
                systemInstruction,
            }
        });

        for await (const chunk of response) {
            yield chunk.text;
        }
    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt');
    }
}

export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  const prompt = `Analyze the mood and feeling of the following color palette. Describe it in a short, evocative phrase (e.g., "Warm and Nostalgic", "Cyberpunk Dystopia", "Earthy and Grounded"). Palette: ${hexColors.join(', ')}`;
  try {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
      model: settings.llmModel,
      contents: prompt,
      config: {
        temperature: 0.5,
      },
    });
    return response.text.trim();
  } catch (err) {
    console.error("Failed to analyze palette mood", err);
    return "Analysis unavailable";
  }
};

export const generateColorNameGemini = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    const prompt = `Given the color ${hexColor} which is part of a palette with an overall mood of "${mood}", generate a short, evocative, and poetic name for this specific color. The name should be creative and descriptive, like "faded sage in twilight" or "industrial mint". Return only the name itself, without any quotation marks, preamble, or explanation.`;
    try {
        const ai = getGeminiClient(settings);
        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: prompt,
            config: {
                temperature: 0.8, // A bit more creative
            },
        });
        return response.text.trim().replace(/"/g, ''); // Clean up quotes
    } catch (err) {
        console.error(`Failed to generate name for color ${hexColor}`, err);
        return "Unnamed Color"; // Fallback
    }
};

export const dissectPromptGemini = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a prompt engineering expert. Your task is to analyze the user's prompt and break it down into its core components. Identify elements like subject, action, style, mood, composition, lighting, and any other distinct modifiers. If a component isn't present, omit it from the response. Return ONLY a single, valid JSON object where keys are the component names (e.g., "subject") and values are the corresponding phrases from the prompt.`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                subject: { type: Type.STRING, description: "The main subject of the prompt." },
                action: { type: Type.STRING, description: "The action the subject is performing." },
                setting: { type: Type.STRING, description: "The location or environment." },
                style: { type: Type.STRING, description: "The artistic style (e.g., photorealistic, oil painting)." },
                mood: { type: Type.STRING, description: "The emotional tone or atmosphere." },
                composition: { type: Type.STRING, description: "The camera angle or shot composition." },
                lighting: { type: Type.STRING, description: "The description of the lighting." },
                details: { type: Type.STRING, description: "Any other specific details or modifiers." }
            },
        };

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: promptText,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema,
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (err) {
        throw handleGeminiError(err, 'dissecting your prompt');
    }
};

export const generateFocusedVariationsGemini = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a creative assistant. Given a prompt and its dissected components, generate 3-4 creative variations for EACH component. The variations should be suitable alternatives that could be swapped into the original prompt. For the prompt "${promptText}", provide variations for these components: ${Object.keys(components).join(', ')}. Return ONLY a single, valid JSON object where keys are the component names and values are an array of variation strings.`;

        const properties: { [key: string]: any } = {};
        for (const key in components) {
            properties[key] = {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            };
        }

        const responseSchema = {
            type: Type.OBJECT,
            properties,
        };

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: `Original prompt: "${promptText}"\nComponents to vary: ${JSON.stringify(components)}`,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema,
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (err) {
        throw handleGeminiError(err, 'generating focused variations');
    }
};

export const reconstructPromptGemini = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a world-class prompt engineer. Your task is to take a structured set of prompt components and reconstruct them into a single, cohesive, and descriptive natural language prompt. Combine the elements into a flowing sentence or paragraph. Do not return JSON or a list. Return ONLY the final prompt text.`;

        const componentString = Object.entries(components).map(([key, value]) => ` - ${key}: ${value}`).join('\n');
        const userPrompt = `Reconstruct a prompt from these components:\n${componentString}`;

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: userPrompt,
            config: {
                systemInstruction,
            }
        });
        
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing your prompt');
    }
};

export const replaceComponentInPromptGemini = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are an expert prompt editor. Your task is to take an existing prompt and seamlessly replace a specific component within it with a new value. You must maintain the original prompt's structure, grammar, and tone as much as possible. Return ONLY the single, rewritten prompt text, without any preamble or explanation.`;

        const userPrompt = `Original Prompt: "${originalPrompt}"\n\nRewrite this prompt by changing the component "${componentKey}" to have the new value: "${newValue}"`;

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: userPrompt,
            config: {
                systemInstruction,
                temperature: 0.5,
            }
        });
        
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'replacing a prompt component');
    }
};

export const reconstructFromIntentGemini = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a world-class prompt engineer. Your task is to take a list of user-provided keywords, concepts, and intents, and weave them into a single, cohesive, and descriptive natural language prompt. The final prompt should be a flowing sentence or paragraph. Do not return JSON or a list. Return ONLY the final prompt text.`;
        
        const userPrompt = `Generate a descriptive prompt from the following intents: ${intents.join(', ')}`;

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: userPrompt,
            config: {
                systemInstruction,
            }
        });
        
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing from intent');
    }
};

export const generatePromptFormulaGemini = async (promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a prompt engineering expert. Your task is to analyze the user's prompt and create a generalized, reusable template from it. Identify the core components of the prompt (like subject, action, style, location, composition, etc.) and replace them with placeholders in the format __component_name__. The final output should be ONLY the template string, without any explanation or preamble. For example, if the prompt is "a cinematic shot of a stoic warrior on a cliff overlooking a stormy sea", a good formula would be "a __style__ of a __subject__ on a __location__ overlooking a __setting__". Use double underscores for placeholders.`;

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: `Analyze and create a formula for this prompt: "${promptText}"`,
            config: {
                systemInstruction,
            }
        });
        
        return response.text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'generating a prompt formula');
    }
};

export const generateArtistDescriptionGemini = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const systemInstruction = `You are a concise art historian. Your task is to generate a brief, one-sentence description of an artist's signature style. Focus on key visual characteristics, common subjects, or their main artistic movement. The description should be suitable for a quick reference cheatsheet. Do not use any preamble or explanation, return only the single sentence description.`;

        const userPrompt = `Generate a description for the artist: ${artistName}`;

        const response = await ai.models.generateContent({
            model: settings.llmModel,
            contents: userPrompt,
            config: {
                systemInstruction,
                temperature: 0.5,
            }
        });
        
        const description = response.text.trim();
        if (!description) {
            throw new Error("The AI returned an empty description.");
        }
        return description;
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

        let detailInstruction = '';
        switch (promptLength) {
            case 'Short':
                detailInstruction = `Generate a very concise, evocative prompt, like a title.`;
                break;
            case 'Long':
                detailInstruction = `Generate three highly detailed and descriptive narrative prompts. Describe the subject, scene, lighting, mood, and composition in great depth.`;
                break;
            case 'Medium':
            default:
                detailInstruction = `Generate three descriptive prompts of medium length. Add details about the subject, environment, and overall mood.`;
                break;
        }

        const systemInstruction = `You are an expert at analyzing images and creating effective prompts for generative AI. Analyze the user's image and follow their instructions precisely. Return only the generated prompts, each on a new line, without any preamble or explanation.`;

        const textPart = {
            text: `Based on this image, generate creative prompts for the generative AI model "${targetAIModel}". ${detailInstruction}`,
        };
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64ImageData,
            },
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                systemInstruction,
            }
        });
        
        const text = response.text;
        const suggestions = text.split('\n')
            .map(s => s.trim().replace(/^\s*\d+\.\s*/, ''))
            .filter(Boolean);
            
        if (suggestions.length === 0) {
            throw new Error("The AI returned an empty response. The image might be unclear or unsupported.");
        }

        return { suggestions };

    } catch (err) {
        throw handleGeminiError(err, 'describing your image');
    }
};