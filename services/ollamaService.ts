
import { handleGeminiError } from '../utils/errorHandler'; 
import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy } from '../types';

export const enhancePromptOllama = async (
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
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
                options: {
                    temperature: 0.7, // Slightly higher for more creative/descriptive results
                    top_p: 0.9,
                    repeat_penalty: 1.2
                }
            }),
        });
        if (!apiResponse.ok) throw new Error(`Ollama failed: ${apiResponse.status}`);
        const responseData = await apiResponse.json();
        return responseData.response || '';
    } catch (err) {
        throw handleGeminiError(err, 'enhancing with Ollama');
    }
};

export async function* enhancePromptOllamaStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): AsyncGenerator<string> {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
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
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    repeat_penalty: 1.2
                }
            }),
        });
        if (!apiResponse.ok || !apiResponse.body) throw new Error("Ollama stream error.");
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
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) yield parsed.response;
                } catch (e) {}
            }
        }
    } catch (err) {
        throw handleGeminiError(err, 'enhancing with Ollama stream');
    }
}

export const refineSinglePromptOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
                options: {
                    temperature: 0.5,
                    top_p: 0.9,
                    repeat_penalty: 1.1
                }
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama request failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'refining with Ollama');
    }
};

export async function* refineSinglePromptOllamaStream(promptText: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: true,
                keep_alive: "15m",
                options: {
                    temperature: 0.5,
                    top_p: 0.9
                }
            }),
        });
        if (!apiResponse.ok || !apiResponse.body) throw new Error("Ollama stream failed.");
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
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) yield parsed.response;
                } catch (e) {}
            }
        }
    } catch (err) {
        throw handleGeminiError(err, 'refining with Ollama stream');
    }
}

export const analyzePaletteMoodOllama = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
  try {
    if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
    const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        prompt: `Palette: ${hexColors.join(', ')}`,
        system: "Output mood in 3-5 words.",
        stream: false,
        keep_alive: "15m",
        options: { temperature: 0.5 },
      }),
    });
    if (!apiResponse.ok) throw new Error("Ollama failed.");
    const responseData = await apiResponse.json();
    return (responseData.response || '').trim();
  } catch (err) {
    return "Analysis unavailable";
  }
};

export const generateColorNameOllama = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: `Hex:${hexColor}, Mood:${mood}`,
                system: "Output one poetic 2-word name. Text only.",
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.8 },
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim().replace(/"/g, '');
    } catch (err) {
        return "Unnamed Color";
    }
};

export const dissectPromptOllama = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const response = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: "Task: JSON dissect prompt into keys (subject, action, style, mood, composition, lighting, details).",
                stream: false,
                format: 'json',
                keep_alive: "15m",
            }),
        });
        if (!response.ok) throw new Error("Ollama failed.");
        const data = await response.json();
        const jsonText = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (err) {
        throw handleGeminiError(err, 'dissecting with Ollama');
    }
};

export const generateFocusedVariationsOllama = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const response = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: `Orig:"${promptText}"\nKeys:${JSON.stringify(components)}`,
                system: "Task: Output 3 variations per key. JSON only.",
                stream: false,
                format: 'json',
                keep_alive: "15m",
            }),
        });
        if (!response.ok) throw new Error("Ollama failed.");
        const data = await response.json();
        const jsonText = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (err) {
        throw handleGeminiError(err, 'variations with Ollama');
    }
};

export const reconstructPromptOllama = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const userPrompt = `Reconstruct from components:\n${JSON.stringify(components)}`;
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: "Merge components into cohesive natural prose. No preamble.",
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.5 }
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstructing with Ollama');
    }
};

export const replaceComponentInPromptOllama = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const userPrompt = `Orig:"${originalPrompt}"\nKey:${componentKey}\nNew:${newValue}`;
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: userPrompt,
                system: "Swap value seamlessly. No preamble.",
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.4 },
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'replacing with Ollama');
    }
};

export const reconstructFromIntentOllama = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: intents.join(', '),
                system: "Merge intents into descriptive prose. No preamble.",
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.5 }
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'intent with Ollama');
    }
};

export const generatePromptFormulaOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.2 }
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, 'formula with Ollama');
    }
};

export const generateArtistDescriptionOllama = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: artistName,
                system: "Brief 1-sentence style description. No preamble.",
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.5 },
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        return (responseData.response || '').trim();
    } catch (err) {
        throw handleGeminiError(err, `artist desc with Ollama`);
    }
};

export const abstractImageOllama = async (
    base64ImageData: string,
    promptLength: string,
    targetAIModel: string,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    try {
        if (!settings.ollamaBaseUrl || !settings.ollamaModel) throw new Error("Ollama not configured.");
        const textPrompt = `Generate prompts for ${targetAIModel}. Length:${promptLength}.`;
        const apiResponse = await fetch(`${settings.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: textPrompt,
                system: "Analyze image. Return 3 prompts. Newline-sep. No preamble.",
                images: [base64ImageData],
                stream: false,
                keep_alive: "15m",
                options: { temperature: 0.4 }
            }),
        });
        if (!apiResponse.ok) throw new Error("Ollama failed.");
        const responseData = await apiResponse.json();
        const cleanedText = responseData.response || '';
        const suggestions = cleanedText.split('\n').map(s => s.trim().replace(/^(\d+[\.\)]|\*|-|\+)\s+/, '')).filter(Boolean);
        return { suggestions };
    } catch (err) {
        throw handleGeminiError(err, 'describing image with Ollama');
    }
};
