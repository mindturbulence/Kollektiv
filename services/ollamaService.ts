import { handleGeminiError } from '../utils/errorHandler'; 
import type { LLMSettings, EnhancementResult } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

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
 * BASE_CONFIG provides optimized parameters for Ollama.
 * num_predict is now handled dynamically per request to prevent cut-offs.
 */
const BASE_CONFIG = {
    keep_alive: "30m",
    options: {
        num_ctx: 8192, // Increased context window for longer prompt histories
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.05 // Relaxed slightly to prevent early stopping in descriptive texts
    }
};

const getOllamaConfig = (settings: LLMSettings) => {
    const isCloud = settings.activeLLM === 'ollama_cloud';
    const rawBaseUrl = sanitizeUrl(isCloud ? settings.ollamaCloudBaseUrl : settings.ollamaBaseUrl);
    
    let effectiveBaseUrl = rawBaseUrl;
    let extraHeaders: Record<string, string> = {};

    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (rawBaseUrl.startsWith('http:') && !rawBaseUrl.startsWith('/proxy-remote') && !rawBaseUrl.includes('localhost') && !rawBaseUrl.includes('127.0.0.1')) {
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

        // Optimization: If we are in a cloud environment (HTTPS) and targeting a local proxy, 
        // skip the automatic fetch to avoid console/terminal noise if Ollama isn't running.
        // Users can still manually refresh or test connection in settings.
        const isTargetingLocal = config.baseUrl === '/ollama-local' || 
                               (config.baseUrl === '/proxy-remote' && (config.headers as any)['x-target-url'] && isLocalOllama((config.headers as any)['x-target-url'])) ||
                               isLocalOllama(config.baseUrl);

        if (window.location.protocol === 'https:' && isTargetingLocal) {
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

export async function* enhancePromptOllamaStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
    maxTokens: number = 2048
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: maxTokens
                }
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
                    if (parsed.done) {
                        const tokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
                        if (tokens > 0) trackTokenUsage(settings.activeLLM === 'ollama_cloud' ? 'ollama_cloud' : 'ollama', tokens);
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'enhancing with Ollama stream');
    }
}

export async function* streamChatOllama(
    messages: { role: 'user' | 'assistant' | 'system', content: string }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    try {
        const config = getOllamaConfig(settings);
        if (!config.baseUrl || !config.model) throw new Error("Ollama configuration missing.");
        
        const ollamaMessages = messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const apiResponse = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: ollamaMessages,
                stream: true,
                ...BASE_CONFIG,
                options: { ...BASE_CONFIG.options, num_predict: 4096 }
            }),
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            let msg = `Ollama Chat Stream failed (${apiResponse.status})`;
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
                    if (parsed.message?.content) yield parsed.message.content;
                    if (parsed.done) {
                        const tokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
                        if (tokens > 0) trackTokenUsage(settings.activeLLM === 'ollama_cloud' ? 'ollama_cloud' : 'ollama', tokens);
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'chatting with Ollama');
    }
}

export const refineSinglePromptOllama = async (promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): Promise<string> => {
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: maxTokens
                }
            }),
        });
        if (!apiResponse.ok) throw new Error(`Ollama status: ${apiResponse.status}`);
        const responseData = await apiResponse.json();
        
        const tokens = (responseData.prompt_eval_count || 0) + (responseData.eval_count || 0);
        if (tokens > 0) trackTokenUsage(settings.activeLLM === 'ollama_cloud' ? 'ollama_cloud' : 'ollama', tokens);

        return responseData.response || '';
    } catch (err) {
        throw handleGeminiError(err, 'refining with Ollama');
    }
};

export async function* refineSinglePromptOllamaStream(promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): AsyncGenerator<string> {
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: maxTokens
                }
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
                    if (parsed.done) {
                        const tokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
                        if (tokens > 0) trackTokenUsage(settings.activeLLM === 'ollama_cloud' ? 'ollama_cloud' : 'ollama', tokens);
                    }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 64
                }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 32
                }
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim().replace(/"/g, '');
    } catch (err) { return "Archived Color"; }
};

export const convertPromptToNaturalLanguage = async (promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: `ORIGINAL PROMPT: ${promptText}`,
                system: `Task: Convert this Stable Diffusion/Midjourney prompt into a clear, natural English narrative.
                
PROTOCOL:
1. PRESERVE EVERY DETAIL: Every subject, action, lighting style, camera angle, artist, and medium must be included in the narrative.
2. STRIP TECHNICAL SYNTAX: Remove brackets ( ), [ ], { }, :: and weights like (tag:1.2).
3. REMOVE SCORING: Strip quality tags like "highly detailed", "8k", "masterpiece".
4. REMOVE PARAMS: Strip --ar, --v, --q, --s, --niji, etc.
5. MERGE INTO PROSE: Instead of a list, write a flowing description (e.g., "A high-fashion portrait of a woman wearing a red dress, shot on a Leica M11 with soft studio lighting in a minimalist room").
6. NO INTRO/OUTRO: Output the narrative text ONLY.`,
                stream: false,
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 800
                }
            }),
        });
        const data = await apiResponse.json();
        return (data.response || promptText).trim();
    } catch (err) {
        console.error('Natural language conversion failed:', err);
        return promptText;
    }
};

export const dissectPromptOllama = async (promptText: string, settings: LLMSettings, modifierCatalog?: string, modelName?: string): Promise<{ naturalLanguage: string, prompt: string, modifiers: { [key: string]: string }, constantModifier: string, categorizedParameters: { label: string, value: string }[] }> => {
    try {
        const config = getOllamaConfig(settings);
        
        const naturalLang = await convertPromptToNaturalLanguage(promptText, settings);
        
        const systemInstruction = `Task: Perform a deep neural breakdown of the provided natural language prompt into atomic components and extract smart parameters.
${modelName ? `Target Model Architecture: ${modelName}.` : ''}

STRICT JSON OUTPUT SCHEMA:
{
  "prompt": "The pure subject/action/narrative core ONLY. Remove all stylistic words.",
  "modifiers": {
    "artStyle": "Style if mentioned",
    "artist": "Artist name if mentioned",
    "photographyStyle": "Photography genre if mentioned",
    "aestheticLook": "Cinematic/Visual vibe",
    "lighting": "Specific lighting setup",
    "cameraAngle": "Angle descriptor",
    "cameraProximity": "Framing/Shot type",
    "composition": "Layout rules",
    "aspectRatio": "Requested ratio",
    "motion": "Kinetic details (for video)",
    "facialExpression": "Facial details",
    ... (Add any applicable category)
  },
  "categorizedParameters": [
    { "label": "Parameter Name", "value": "Parameter Value" }
  ],
  "constantModifier": "Anything that didn't fit above"
}

STRICT BREAKDOWN RULES:
1. STRIP THE CORE: The "prompt" key must be the bare-bones subject (e.g., "A golden retriever sitting in a field"). Eliminate adjectives like "vibrant", "moody", or "cinematic" from this field.
2. MAP INTELLIGENTLY: Categorize every adjective and technical term into the "modifiers" object.
3. USE THE CATALOG: ${modifierCatalog ? `If values from this catalog match, use them: [CATALOG START]\n${modifierCatalog}\n[CATALOG END]` : 'Map terms based on standard photography and art categories.'}
4. NO DEFAULTS: Only include keys that are EXPLICITLY present. Do not include keys with "None", "Default", or "N/A".
5. JSON ONLY: Output the raw JSON string only. No markdown, no "Here is your JSON".

[ONE-SHOT EXAMPLE]
Input: "A professional wildlife photo of a lion in the savanna at sunset, close up, warm lighting, f2.8, cinematic mood."
Result: {
  "prompt": "lion in the savanna",
  "modifiers": {
    "photographyStyle": "Wildlife Photography",
    "lighting": "Sunset, warm lighting",
    "cameraProximity": "Close-Up",
    "cameraSettings": "f2.8",
    "aestheticLook": "Cinematic"
  },
  "categorizedParameters": [{ "label": "Time of Day", "value": "Sunset" }],
  "constantModifier": ""
}

Input for Processing: "${naturalLang}"`;

        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: "PROCESS INPUT NOW.",
                system: systemInstruction,
                stream: false,
                format: "json",
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1200
                }
            }),
        });
        const data = await apiResponse.json();
        try {
            const result = JSON.parse(data.response || '{}');
            return {
                naturalLanguage: naturalLang,
                prompt: result.prompt || '',
                modifiers: result.modifiers || {},
                constantModifier: result.constantModifier || '',
                categorizedParameters: (result.categorizedParameters || []).slice(0, 10)
            };
        } catch (e) {
            console.error('JSON Parse error in dissection:', e);
            return { naturalLanguage: naturalLang, prompt: promptText, modifiers: {}, constantModifier: '', categorizedParameters: [] };
        }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 2048
                }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1024
                }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1024
                }
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'updating'); }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1500
                }
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'reconstruction'); }
};

export const abstractImageOllama = async (base64ImageData: string, promptLength: string, _targetAIModel: string, settings: LLMSettings): Promise<EnhancementResult> => {
    try {
        const config = getOllamaConfig(settings);
        const tokenLimit = promptLength === 'Long' ? 2048 : 1024;
        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                images: [base64ImageData],
                prompt: "Deconstruct this image into a comprehensive, high-fidelity descriptive prompt. Provide 3 distinct variations of the prompt, separated by newlines. Focus on micro-textures, lighting interaction, physical materials, and atmospheric density. Output the variations ONLY. No preamble.",
                stream: false,
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: tokenLimit
                }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1024
                }
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
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 512
                }
            }),
        });
        const data = await apiResponse.json();
        return (data.response || '').trim();
    } catch (err) { throw handleGeminiError(err, 'description'); }
};