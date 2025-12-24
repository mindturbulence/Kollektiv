
import { handleGeminiError } from '../utils/errorHandler'; // Re-using error handler for now
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';

export const enhancePromptOllama = async (
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured. Please set the Base URL and Model Name in Settings > LLM.");
        }

        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: fullPrompt,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
            }),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            throw new Error(`Ollama API request failed with status ${apiResponse.status}: ${errorText}`);
        }

        const responseData = await apiResponse.json();
        const text = responseData.response;
        
        if (!text || typeof text !== 'string') {
            throw new Error("Ollama returned an invalid or empty response body.");
        }
        
        return text;

    } catch (err) {
        // Can create a specific ollama error handler if needed.
        throw handleGeminiError(err, 'enhancing your prompt with Ollama');
    }
};

export async function* enhancePromptOllamaStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): AsyncGenerator<string> {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured. Please set the Base URL and Model Name in Settings > LLM.");
        }

        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: fullPrompt,
                system: systemInstruction,
                stream: true,
                keep_alive: "15m",
            }),
        });

        if (!apiResponse.ok || !apiResponse.body) {
            const errorText = await apiResponse.text();
            throw new Error(`Ollama API request failed with status ${apiResponse.status}: ${errorText}`);
        }

        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            buffer = lines.pop() || ''; // Keep the last partial line in the buffer

            for (const line of lines) {
                if (line.trim() === '') continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        yield parsed.response;
                    }
                } catch (e) {
                    console.warn("Could not parse JSON line from Ollama stream:", line);
                }
            }
        }
        
        if (buffer.trim()) {
            try {
                const parsed = JSON.parse(buffer);
                if (parsed.response) {
                    yield parsed.response;
                }
            } catch (e) {
                console.warn("Could not parse final JSON from Ollama stream:", buffer);
            }
        }

    } catch (err) {
        throw handleGeminiError(err, 'enhancing your prompt with Ollama stream');
    }
}


export const refineSinglePromptOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
            }),
        });
        
        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        
        const responseData = await apiResponse.json();
        const text = responseData.response;
        
        if (!text || typeof text !== 'string') {
            throw new Error("Ollama returned an invalid or empty response body.");
        }

        return text.trim();

    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt with Ollama');
    }
};

export async function* refineSinglePromptOllamaStream(promptText: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: true,
                keep_alive: "15m",
            }),
        });
        
        if (!apiResponse.ok || !apiResponse.body) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        
        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        yield parsed.response;
                    }
                } catch (e) {
                    console.warn("Could not parse JSON line from Ollama stream:", line);
                }
            }
        }

        if (buffer.trim()) {
            try {
                const parsed = JSON.parse(buffer);
                if (parsed.response) {
                    yield parsed.response;
                }
            } catch (e) {
                console.warn("Could not parse final JSON from Ollama stream:", buffer);
            }
        }

    } catch (err) {
        throw handleGeminiError(err, 'refining the prompt with Ollama stream');
    }
}


export const analyzePaletteMoodOllama = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  const prompt = `Analyze the mood and feeling of the following color palette. Describe it in a short, evocative phrase (e.g., "Warm and Nostalgic", "Cyberpunk Dystopia", "Earthy and Grounded"). Palette: ${hexColors.join(', ')}`;
  try {
    if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
      throw new Error("Ollama is not configured. Please set the Base URL and Model Name in Settings > LLM.");
    }

    const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        prompt: prompt,
        stream: false,
        keep_alive: "15m",
        options: {
          temperature: 0.5,
        },
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Ollama API request failed with status ${apiResponse.status}: ${errorText}`);
    }

    const responseData = await apiResponse.json();
    const text = responseData.response;

    if (!text || typeof text !== 'string') {
      throw new Error("Ollama returned an invalid or empty response body.");
    }

    return text.trim();
  } catch (err) {
    console.error("Failed to analyze palette mood with Ollama", err);
    return "Analysis unavailable";
  }
};

export const generateColorNameOllama = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    const prompt = `Given the color ${hexColor} which is part of a palette with an overall mood of "${mood}", generate a short, evocative, and poetic name for this specific color. The name should be creative and descriptive, like "faded sage in twilight" or "industrial mint". Return only the name itself, without any quotation marks, preamble, or explanation.`;
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: prompt,
                stream: false,
                keep_alive: "15m",
                options: {
                    temperature: 0.8,
                },
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();
        const text = responseData.response;
        
        if (!text || typeof text !== 'string') {
            throw new Error("Ollama returned an invalid or empty response body.");
        }
        
        return text.trim().replace(/"/g, '');

    } catch (err) {
        console.error(`Failed to generate name for color ${hexColor} with Ollama`, err);
        return "Unnamed Color";
    }
};

export const dissectPromptOllama = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are a prompt engineering expert. Your task is to analyze the user's prompt and break it down into its core components. Identify elements like subject, action, style, mood, composition, lighting, and any other distinct modifiers. If a component isn't present, omit it from the response. Return ONLY a single, valid JSON object where keys are the component names (e.g., "subject") and values are the corresponding phrases from the prompt. Example response: {"subject": "a knight", "action": "fighting a dragon", "style": "oil painting"}`;

        const response = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                format: 'json',
                keep_alive: "15m",
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API request failed with status ${response.status}`);
        }
        const responseText = await response.text();
        if (!responseText) {
             throw new Error("Ollama returned an empty response body.");
        }
        const data = JSON.parse(responseText);
        const jsonText = data.response;
        // Ollama often wraps the JSON in markdown, so we need to clean it
        const cleanedJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);

    } catch (err) {
        throw handleGeminiError(err, 'dissecting your prompt with Ollama');
    }
};

export const generateFocusedVariationsOllama = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are a creative assistant. Given a prompt and its dissected components, generate 3-4 creative variations for EACH component. The variations should be suitable alternatives that could be swapped into the original prompt. For the prompt "${promptText}", provide variations for these components: ${Object.keys(components).join(', ')}. Return ONLY a single, valid JSON object where keys are the component names and values are an array of variation strings. Example response: {"subject": ["a wizard", "a cyborg", "a space explorer"]}`;

        const response = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: `Original prompt: "${promptText}"\nComponents to vary: ${JSON.stringify(components)}`,
                system: systemInstruction,
                stream: false,
                format: 'json',
                keep_alive: "15m",
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Ollama API request failed with status ${response.status}`);
        }
        const responseText = await response.text();
        if (!responseText) {
            throw new Error("Ollama returned an empty response body.");
        }
        const data = JSON.parse(responseText);
        const jsonText = data.response;
        const cleanedJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);
    } catch (err) {
        throw handleGeminiError(err, 'generating focused variations with Ollama');
    }
};

export const reconstructPromptOllama = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are a world-class prompt engineer. Your task is to take a structured set of prompt components and reconstruct them into a single, cohesive, and descriptive natural language prompt. Combine the elements into a flowing sentence or paragraph. Do not return JSON or a list. Return ONLY the final prompt text.`;

        const componentString = Object.entries(components).map(([key, value]) => ` - ${key}: ${value}`).join('\n');
        const userPrompt = `Reconstruct a prompt from these components:\n${componentString}`;
        
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
            }),
        });
        
        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        const responseData = await apiResponse.json();
        const text = responseData.response;
        return text.trim();

    } catch (err) {
        throw handleGeminiError(err, 'reconstructing your prompt with Ollama');
    }
};

export const replaceComponentInPromptOllama = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are an expert prompt editor. Your task is to take an existing prompt and seamlessly replace a specific component within it with a new value. You must maintain the original prompt's structure, grammar, and tone as much as possible. Return ONLY the single, rewritten prompt text, without any preamble or explanation.`;

        const userPrompt = `Original Prompt: "${originalPrompt}"\n\nRewrite this prompt by changing the component "${componentKey}" to have the new value: "${newValue}"`;

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
                options: {
                    temperature: 0.5,
                },
            }),
        });
        
        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        const responseData = await apiResponse.json();
        const text = responseData.response;
        return text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'replacing a prompt component with Ollama');
    }
};

export const reconstructFromIntentOllama = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are a world-class prompt engineer. Your task is to take a list of user-provided keywords, concepts, and intents, and weave them into a single, cohesive, and descriptive natural language prompt. The final prompt should be a flowing sentence or paragraph. Do not return JSON or a list. Return ONLY the final prompt text.`;
        
        const userPrompt = `Generate a descriptive prompt from the following intents: ${intents.join(', ')}`;

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
            }),
        });
        
        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        const responseData = await apiResponse.json();
        const text = responseData.response;
        return text.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing from intent with Ollama');
    }
};

export const generatePromptFormulaOllama = async (promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }

        const systemInstruction = `You are a prompt engineering expert. Your task is to analyze the user's prompt and create a generalized, reusable template from it. Identify the core components of the prompt (like subject, action, style, location, composition, etc.) and replace them with placeholders in the format _component_name_. The final output should be ONLY the template string, without any explanation or preamble. For example, if the prompt is "a cinematic shot of a stoic warrior on a cliff overlooking a stormy sea", a good formula would be "a _style_ of a _subject_ on a _location_ overlooking a _setting_".`;
        
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        }
        
        const responseData = await apiResponse.json();
        const text = responseData.response;
        
        if (!text || typeof text !== 'string') {
            throw new Error("Ollama returned an invalid or empty response body.");
        }

        return text.trim();

    } catch (err) {
        throw handleGeminiError(err, 'generating a prompt formula with Ollama');
    }
};

export const generateArtistDescriptionOllama = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured.");
        }
        const systemInstruction = `You are a concise art historian. Your task is to generate a brief, one-sentence description of an artist's signature style. Focus on key visual characteristics, common subjects, or their main artistic movement. The description should be suitable for a quick reference cheatsheet. Do not use any preamble or explanation, return only the single sentence description.`;
        const userPrompt = `Generate a description for the artist: ${artistName}`;

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
                options: {
                    temperature: 0.5,
                },
            }),
        });

        if (!apiResponse.ok) throw new Error(`Ollama API request failed with status ${apiResponse.status}`);
        
        const responseData = await apiResponse.json();
        const description = responseData.response.trim();
        if (!description) throw new Error("Ollama returned an empty description.");
        
        return description;
    } catch (err) {
        throw handleGeminiError(err, `generating artist description with Ollama`);
    }
};

export const abstractImageOllama = async (
    base64ImageData: string,
    promptLength: string,
    targetAIModel: string,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) {
            throw new Error("Ollama is not configured. Please set the Base URL and Model Name in Settings > LLM.");
        }

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
        const textPrompt = `Generate creative prompts for the generative AI model "${targetAIModel}". ${detailInstruction}`;

        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: textPrompt,
                system: systemInstruction,
                images: [base64ImageData],
                stream: false,
                keep_alive: "15m",
            }),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            if (errorText.toLowerCase().includes('model is not multimodal')) {
                throw new Error(`The selected Ollama model (${settings.ollamaModel}) does not support images. Please use a multimodal model like LLaVA.`);
            }
            throw new Error(`Ollama API request failed with status ${apiResponse.status}: ${errorText}`);
        }

        const responseData = await apiResponse.json();
        const text = responseData.response;
        
        if (!text || typeof text !== 'string') {
            throw new Error("Ollama returned an invalid or empty response body.");
        }
        
        const suggestions = text.split('\n')
            .map(s => s.trim().replace(/^\s*\d+\.\s*/, ''))
            .filter(Boolean);
        
        if (suggestions.length === 0) {
            throw new Error("Ollama returned an empty response. The image might be unclear or unsupported.");
        }

        return { suggestions };

    } catch (err) {
        throw handleGeminiError(err, 'describing your image with Ollama');
    }
};
