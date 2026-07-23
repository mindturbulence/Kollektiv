import { handleGeminiError } from '../utils/errorHandler'; 
import type { LLMSettings } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

/**
 * Sanitizes base URL by removing trailing slashes and common API paths.
 */
const sanitizeUrl = (url: string) => {
    if (!url || typeof url !== 'string') return '';
    let sanitized = url.trim().replace(/\/+$/, '');
    if (sanitized && !sanitized.startsWith('http') && !sanitized.startsWith('/')) {
        sanitized = 'http://' + sanitized;
    }
    return sanitized;
};

const getLlamaCppConfig = (settings: LLMSettings) => {
    const rawBaseUrl = sanitizeUrl(settings.llamacppBaseUrl || 'http://localhost:8080');
    
    let effectiveBaseUrl = rawBaseUrl;
    let extraHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (typeof window !== 'undefined') {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalHost && (rawBaseUrl.includes('localhost:8080') || rawBaseUrl.includes('127.0.0.1:8080'))) {
            effectiveBaseUrl = '/llamacpp-local';
        } else if (window.location.protocol === 'https:') {
            if ((rawBaseUrl.startsWith('http:') || rawBaseUrl.startsWith('https:')) && 
                !rawBaseUrl.includes('localhost') && 
                !rawBaseUrl.includes('127.0.0.1')) {
                effectiveBaseUrl = '/proxy-remote';
                extraHeaders['x-target-url'] = rawBaseUrl;
            }
        }
    }

    if (settings.llamacppApiKey) {
        extraHeaders['Authorization'] = `Bearer ${settings.llamacppApiKey}`;
    }

    return {
        baseUrl: effectiveBaseUrl,
        model: settings.llamacppModel || 'default',
        headers: extraHeaders
    };
};

export const fetchLlamaCppModels = async (settings: LLMSettings): Promise<string[]> => {
    try {
        const config = getLlamaCppConfig(settings);
        if (!config.baseUrl) return ['default'];

        // Avoid querying default placeholder domains
        const targetUrl = config.headers['x-target-url'] || config.baseUrl;
        if (targetUrl && (targetUrl.toLowerCase().includes('localhost:8080') || targetUrl.toLowerCase().includes('127.0.0.1:8080'))) {
            if (window.location.protocol === 'https:' && config.baseUrl === '/llamacpp-local') {
                return ['default'];
            }
        }

        const response = await fetch(`${config.baseUrl}/v1/models`, {
            method: 'GET',
            headers: config.headers
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error body');
            const isConnRefused = errorText.includes('ECONNREFUSED');
            if (isConnRefused) {
                console.warn(`Llama.cpp not available (${response.status}) — using default models.`);
            } else {
                console.error(`Llama.cpp models fetch failed: ${response.status} ${response.statusText}`, errorText.slice(0, 500));
            }
            return ['default'];
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text().catch(() => 'Unreadable body');
            console.warn(`Llama.cpp fetch returned non-JSON (${contentType}):`, text.slice(0, 100) + '...');
            return ['default'];
        }

        const data = await response.json();
        return (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []))
            .map((m: any) => String(m?.id || m || 'default'));
    } catch (e: any) {
        if (!e.message?.includes('Failed to fetch') && !e.message?.includes('ECONNREFUSED') && !e.message?.includes('Load failed')) {
            console.error('Llama.cpp models fetch error:', e);
        }
        return ['default'];
    }
};

export async function* enhancePromptLlamaCppStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
    maxTokens: number = 2048,
    temperature: number = 0.7
): AsyncGenerator<string> {
    try {
        const config = getLlamaCppConfig(settings);
        const fullPrompt = [prompt.trim(), constantModifier.trim()].filter(Boolean).join('\n\n');
        
        const apiResponse = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: fullPrompt }
                ],
                stream: true,
                max_tokens: maxTokens,
                temperature: temperature
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`Llama.cpp Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("Llama.cpp stream body is empty.");
        
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
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                if (trimmed === 'data: [DONE]') return;
                
                try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                        trackTokenUsage('llamacpp', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'enhancing with Llama.cpp');
    }
}

export async function* streamChatLlamaCpp(
    messages: { role: 'user' | 'assistant' | 'system', content: string, attachments?: { data: string, mimeType: string, fileName?: string }[] }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    try {
        const config = getLlamaCppConfig(settings);
        
        const llamacppMessages = messages.map(m => {
            if (m.attachments && m.attachments.length > 0) {
                const contentData: any[] = [{ type: 'text', text: m.content }];
                let skippedNotice = '';
                for (const att of m.attachments) {
                    if (att.mimeType.startsWith('image/')) {
                        contentData.push({
                            type: 'image_url',
                            image_url: { url: att.data }
                        });
                    } else {
                        skippedNotice += `\n[Notice: System skipped unsupported document attachment: ${att.fileName}]`;
                    }
                }
                if (skippedNotice) {
                    contentData[0].text += skippedNotice;
                }
                return { role: m.role, content: contentData };
            }
            return { role: m.role, content: m.content };
        });

        const apiResponse = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: llamacppMessages,
                stream: true,
                max_tokens: 4096
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`Llama.cpp Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("Llama.cpp stream body is empty.");
        
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
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                if (trimmed === 'data: [DONE]') return;
                
                try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                        trackTokenUsage('llamacpp', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'chatting with Llama.cpp');
    }
}

export const refineSinglePromptLlamaCpp = async (promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): Promise<string> => {
    try {
        const config = getLlamaCppConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: promptText }
                ],
                stream: false,
                max_tokens: maxTokens
            }),
        });
        
        if (!apiResponse.ok) throw new Error(`Llama.cpp status: ${apiResponse.status}`);
        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        trackTokenUsage('llamacpp', Math.ceil(content.length / 4));
        return content;
    } catch (err) {
        throw handleGeminiError(err, 'refining with Llama.cpp');
    }
};

export const reconstructFromIntentLlamaCpp = async (intents: string[], settings: LLMSettings): Promise<string> => {
    try {
        const config = getLlamaCppConfig(settings);
        const apiResponse = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { 
                        role: 'system', 
                        content: "Task: Consolidate the provided visual components and descriptive intents into a single, cohesive, high-fidelity visual prompt. Remove redundancies. Ensure a logical flow from subject to environment to artistic style. Output the prompt text ONLY. No preamble." 
                    },
                    { role: 'user', content: `Components: ${intents.join(' | ')}` }
                ],
                stream: false,
                max_tokens: 1000
            }),
        });
        
        if (!apiResponse.ok) throw new Error(`Llama.cpp status: ${apiResponse.status}`);
        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        trackTokenUsage('llamacpp', Math.ceil(content.length / 4));
        return content.trim();
    } catch (err) {
        throw handleGeminiError(err, 'reconstruction with Llama.cpp');
    }
};

export async function* refineSinglePromptLlamaCppStream(
    promptText: string, 
    settings: LLMSettings, 
    systemInstruction: string, 
    maxTokens: number = 1024,
    temperature: number = 0.7
): AsyncGenerator<string> {
    yield* enhancePromptLlamaCppStream(promptText, '', settings, systemInstruction, maxTokens, temperature);
}

export interface LlamaCppTestResult {
    success: boolean;
    status?: number;
    message: string;
}

export const testLlamaCppConnection = async (baseUrl: string, apiKey?: string): Promise<LlamaCppTestResult> => {
    const cleanUrl = sanitizeUrl(baseUrl);
    let targetUrl = cleanUrl;
    let headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (cleanUrl.includes('localhost:') || cleanUrl.includes('127.0.0.1:')) {
            return { success: false, message: "LOCAL TARGET UNREACHABLE IN CLOUD. USE REMOTE OR RUN LOCALLY." };
        } else if (cleanUrl.startsWith('http:')) {
            targetUrl = '/proxy-remote';
            headers['x-target-url'] = cleanUrl;
        }
    }

    try {
        const response = await fetch(`${targetUrl}/v1/models`, { headers });
        if (response.ok) {
            return { success: true, status: response.status, message: "CONNECTION ESTABLISHED (200 OK)" };
        }
        
        const msg = response.status === 500 
            ? "TARGET UNREACHABLE (500). ENSURE LLAMA.CPP IS RUNNING."
            : `HTTP ERROR ${response.status}: ${response.statusText}`;
            
        return { success: false, status: response.status, message: msg };
    } catch (e: any) {
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            if (window.location.protocol === 'https:' && cleanUrl.startsWith('http:') && !headers['x-target-url']) {
                return { success: false, message: "PROTOCOL MISMATCH (HTTPS -> HTTP BLOCKED). USE PROXY." };
            }
            return { success: false, message: "SERVICE REFUSED CONNECTION. CHECK CORS SETTINGS FOR LLAMA.CPP." };
        }
        return { success: false, message: e.message || "CONNECTION REFUSED" };
    }
};
