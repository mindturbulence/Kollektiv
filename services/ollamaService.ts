
import { handleGeminiError } from '../utils/errorHandler'; 
import type { LLMSettings, EnhancementResult } from '../types';

/**
 * Checks if a URL is targeting the local machine's default Ollama port.
 */
const isLocalOllama = (url: string) => {
    return url.includes('localhost:11434') || url.includes('127.0.0.1:11434');
};

/**
 * Sanitizes base URL by removing trailing slashes and common API path segments.
 */
const sanitizeUrl = (url: string) => {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '').replace(/\/api\/tags\/?$/, '').replace(/\/api\/?$/, '');
};

/**
 * FAST_CONFIG provides optimized parameters for Ollama to reduce latency:
 * - num_ctx: Smaller context reduces prompt processing time.
 * - keep_alive: Keeps model in memory for 30 mins to avoid reload lag.
 * - temperature: Slightly lower for more decisive, faster sampling.
 */
const FAST_CONFIG = {
    keep_alive: "30m",
    options: {
        num_ctx: 4096,
        temperature: 0.6,
        top_p: 0.9,
        top_k: 40,
        num_predict: 1024,
        repeat_penalty: 1.1
    }
};

const getOllamaConfig = (settings: LLMSettings) => {
    const isCloud = settings.activeLLM === 'ollama_cloud';
    const rawBaseUrl = sanitizeUrl(isCloud ? settings.ollamaCloudBaseUrl : settings.ollamaBaseUrl);
    
    let effectiveBaseUrl = rawBaseUrl;
    let extraHeaders: Record<string, string> = {};

    if (window.location.protocol === 'https:') {
        if (isLocalOllama(rawBaseUrl)) {
            effectiveBaseUrl = '/ollama-local';
        } else if (isCloud && rawBaseUrl && !rawBaseUrl.startsWith('/proxy-remote')) {
            effectiveBaseUrl = '/proxy-remote';
            extraHeaders['x-target-url'] = rawBaseUrl;
        }
    }

    if (isCloud) {
        let authHeader = '';
        if (settings.ollamaCloudUseGoogleAuth && settings.googleIdentity?.accessToken) {
            authHeader = `Bearer ${settings.googleIdentity.accessToken}`;
        } else if (settings.ollamaCloudApiKey) {
            authHeader = `Bearer ${settings.ollamaCloudApiKey}`;
        }

        return {
            baseUrl: effectiveBaseUrl,
            model: settings.ollamaCloudModel,
            headers: {
                'Content-Type': 'application/json',
                ...extraHeaders,
                ...(authHeader ? { 'Authorization': authHeader } : {})
            }
        };
    }

    return {
        baseUrl: effectiveBaseUrl,
        model: settings.ollamaModel,
        headers: { 
            'Content-Type': 'application/json',
            ...extraHeaders
        }
    };
};

export const fetchOllamaModels = async (settings: LLMSettings, useCloud: boolean = false): Promise<string[]> => {
    try {
        const tempSettings = { ...settings, activeLLM: useCloud ? 'ollama_cloud' as const : 'ollama' as const };
        const config = getOllamaConfig(tempSettings);
        
        if (!config.baseUrl || config.baseUrl === 'http://' || config.baseUrl === 'https://') {
            return [];
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${config.baseUrl}/api/tags`, {
            method: 'GET',
            headers: config.headers,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) return [];
        const data = await response.json();
        return (data.models || []).map((m: any) => m.name);
    } catch (e) {
        if ((e as any).name !== 'AbortError') {
            console.warn("Ollama model list unavailable at:", useCloud ? settings.ollamaCloudBaseUrl : settings.ollamaBaseUrl);
        }
        return [];
    }
};

export const enhancePromptOllama = async (
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        if (!config.baseUrl || !config.model) throw new Error("Ollama configuration missing.");
        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: fullPrompt,
                system: systemInstruction,
                stream: false,
                ...FAST_CONFIG
            }),
        });
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({ error: apiResponse.statusText }));
            throw new Error(errorData.error || `Ollama returned status: ${apiResponse.status}`);
        }
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
        const config = getOllamaConfig(settings);
        if (!config.baseUrl || !config.model) throw new Error("Ollama configuration missing.");
        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: fullPrompt,
                system: systemInstruction,
                stream: true,
                ...FAST_CONFIG
            }),
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            let msg = `Stream failed (${apiResponse.status})`;
            try { msg = JSON.parse(errorBody).error || msg; } catch(e) {}
            throw new Error(msg);
        }
        
        if (!apiResponse.body) throw new Error("Ollama stream body is empty.");
        
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
    } catch (err: any) {
        throw handleGeminiError(err, 'enhancing with Ollama stream');
    }
}

export const refineSinglePromptOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        if (!config.baseUrl || !config.model) throw new Error("Ollama configuration missing.");
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                ...FAST_CONFIG
            }),
        });
        if (!apiResponse.ok) throw new Error(`Ollama status: ${apiResponse.status}`);
        const responseData = await apiResponse.json();
        return responseData.response || '';
    } catch (err) {
        throw handleGeminiError(err, 'refining with Ollama');
    }
};

export async function* refineSinglePromptOllamaStream(promptText: string, settings: LLMSettings, systemInstruction: string): AsyncGenerator<string> {
    try {
        const config = getOllamaConfig(settings);
        if (!config.baseUrl || !config.model) throw new Error("Ollama configuration missing.");
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: promptText,
                system: systemInstruction,
                stream: true,
                ...FAST_CONFIG
            }),
        });
        
        if (!apiResponse.ok) {
             const errorBody = await apiResponse.text();
             let msg = `Stream failed (${apiResponse.status})`;
             try { msg = JSON.parse(errorBody).error || msg; } catch(e) {}
             throw new Error(msg);
        }

        if (!apiResponse.body) throw new Error("Ollama stream error.");
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
    } catch (err: any) {
        throw handleGeminiError(err, 'refining with Ollama stream');
    }
}

export const analyzePaletteMoodOllama = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `Colors: ${hexColors.join(', ')}`,
                system: "Task: mood in 3 words max. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { return "Archive Error"; }
};

export const generateColorNameOllama = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `Hex:${hexColor}, Mood:${mood}`,
                system: "Task: Poetic 2-word name. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim().replace(/"/g, '');
    } catch (err) { return "Archived Color"; }
};

export const dissectPromptOllama = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: promptText,
                system: "Task: JSON dissect prompt (subject, style, mood, lighting). Output valid JSON object only.",
                stream: false,
                format: "json",
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return JSON.parse(data.response || '{}');
    } catch (err) { throw handleGeminiError(err, 'extraction'); }
};

export const generateFocusedVariationsOllama = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `Formula:${promptText}\nKeys:${Object.keys(components).join(',')}`,
                system: "Task: 2 variations per key. Output valid JSON only.",
                stream: false,
                format: "json",
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return JSON.parse(data.response || '{}');
    } catch (err) { throw handleGeminiError(err, 'processing'); }
};

export const reconstructPromptOllama = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: JSON.stringify(components),
                system: "Merge into prose. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const replaceComponentInPromptOllama = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `Orig:${originalPrompt}\nKey:${componentKey}\nNew:${newValue}`,
                system: "Swap value. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'updating'); }
};

export const reconcileDescriptionsOllama = async (existing: string, incoming: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `OLD:\n${existing}\n\nNEW:\n${incoming}`,
                system: "Merge into cohesive paragraph. Remove redundancy. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'syncing'); }
};

export const reconstructFromIntentOllama = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: intents.join(', '),
                system: "Merge into prose. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const abstractImageOllama = async (base64ImageData: string, promptLength: string, targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                images: [base64ImageData],
                prompt: "Deconstruct this image into a comprehensive, high-fidelity descriptive prompt. Provide 3 distinct variations of the prompt, separated by newlines. Focus on micro-textures, lighting interaction, physical materials, and atmospheric density. Output the variations ONLY. No preamble.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        const suggestions = (data.response || '').split('\n').map((s: string) => s.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
        return { suggestions };
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};

export const generatePromptFormulaOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: promptText,
                system: systemInstruction,
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};

export const generateArtistDescriptionOllama = async (artistName: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: artistName,
                system: "Brief style summary. Text only.",
                stream: false,
                ...FAST_CONFIG
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'description'); }
};
