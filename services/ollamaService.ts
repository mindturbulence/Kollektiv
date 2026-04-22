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

        // Optimization: If we are in a cloud environment (HTTPS) and targeting a local proxy, 
        // skip the automatic fetch to avoid console/terminal noise if Ollama isn't running.
        // Users can still manually refresh or test connection in settings.
        const isTargetingLocal = config.baseUrl === '/ollama-local' || 
                               (config.baseUrl === '/proxy-remote' && (config.headers as any)['x-target-url'] && isLocalOllama((config.headers as any)['x-target-url']));

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
                prompt: promptText,
                system: `Task: Convert this Stable Diffusion/Midjourney prompt into clear, natural narrative language.

RULES TO REMOVE/MAP:
- REMOVE brackets: (), [], {}, :: (these are weight syntax - strip them)
- REMOVE权重 syntax: ::weight, .5x, (tag:1.2), (tag1.5)
- REMOVE scoring: --q 0.5, --iw 0.5, --s 250, --c 50, --p
- REMOVE technical params: --ar 16:9, --v 6, --s 750, --no, --seed, --c, --q, --iw, --nij, --style
- REMOVE LoRA references: <lora:name:0.8>, <lora:name>
- REMOVE embeddings: <embedding:name>
- REMOVE wildcard syntax: __wildcard__, {word1|word2}
- REMOVE model tags: [model], (from:ckpt)
- REMOVE step directives: "4k", "photorealistic", "masterpiece" (replace with actual description)
- REMOVE separator syntax: ---, BREAK, AND

REARRANGE INTO NARRATIVE:
- Identify subject(s), action, setting/location
- Identify visual style, medium, lighting, mood
- Identify camera/shot composition details
- Identify clothing, appearance details
- Write as a flowing descriptive scene, not a keyword list
- Keep artistic quality terms if they describe the actual style (e.g., "oil painting", "watercolor")
- If subject is in parentheses with no weight, keep the subject

Output ONLY the natural language narrative, no explanations, no JSON, no lists.`,
                stream: false,
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 600
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
        
        const systemInstruction = `Task: Perform a deep neural breakdown of the provided natural language prompt into its atomic components and extract smart categorized parameters.
${modelName ? `Target Model: ${modelName}.` : ''}

First, interpret the natural language description above into what would be used in an image generation prompt.
Then extract components following this Blueprint:
1. "prompt": The pure subject matter, core action, or narrative intent. Strip all stylistic, technical, and atmospheric modifiers.
2. "modifiers": A JSON object. Categorize as much as possible from the prompt into discrete system parameters (e.g., lighting, style, camera angle, etc.).
3. "categorizedParameters": A JSON array of objects (maximum 10) with "label" (parameter name) and "value" (parameter content), extracted from remaining unmapped details (e.g., "Hair Style", "Location").
4. "constantModifier": Remaining unmapped details that do not fit into standard modifiers or categorized parameters.

Guidance for "modifiers":
- PRIORITIZE mapping to these known keys: artStyle, artist, photographyStyle, aestheticLook, digitalAesthetic, aspectRatio, cameraType, cameraModel, cameraAngle, cameraProximity, cameraSettings, cameraEffect, specialtyLens, lensType, filmType, filmStock, lighting, composition, facialExpression, hairStyle, eyeColor, skinTexture, clothing, motion, cameraMovement, mjVersion, mjNiji, mjAspectRatio, zImageStyle.
- If a value in the prompt matches the INTENT of a category but has custom detail, keep it as the value for that category.

${modifierCatalog ? `[AVAILABLE MODIFIERS CATALOG]\n${modifierCatalog}\n\nSTRICT RULES:
- NO DEFAULTS: Only include parameters explicitly present in the input text. NEVER include items with values like "Default", "Standard", "None", "N/A", or generic placeholders.
- If a parameter is not explicitly mentioned, DO NOT include it in the JSON object at all.` : ''}

Output JSON ONLY. Format: { "prompt": string, "modifiers": { [key: string]: string }, "categorizedParameters": [{ "label": string, "value": string }], "constantModifier": string }`;

        const apiResponse = await fetch(`${config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                prompt: naturalLang,
                system: systemInstruction,
                stream: false,
                format: "json",
                ...BASE_CONFIG,
                options: {
                    ...BASE_CONFIG.options,
                    num_predict: 1024
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