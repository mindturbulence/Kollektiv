import { handleGeminiError } from '../utils/errorHandler'; 
import type { LLMSettings } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

/**
 * Checks if a URL is targeting the local machine's OpenClaw port.
 */
const sanitizeUrl = (url: string) => {
    if (!url || typeof url !== 'string') return '';
    let sanitized = url.trim().replace(/\/+$/, '');
    if (sanitized && !sanitized.startsWith('http') && !sanitized.startsWith('/')) {
        sanitized = 'http://' + sanitized;
    }
    return sanitized;
};

const getOpenClawConfig = (settings: LLMSettings) => {
    const rawBaseUrl = sanitizeUrl(settings.openclawBaseUrl || 'http://localhost:18789');
    
    let effectiveBaseUrl = rawBaseUrl;
    let extraHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (rawBaseUrl.startsWith('http:') && !rawBaseUrl.includes('localhost') && !rawBaseUrl.includes('127.0.0.1')) {
            effectiveBaseUrl = '/proxy-remote';
            extraHeaders['x-target-url'] = rawBaseUrl;
        }
    }

    if (settings.openclawApiKey) {
        extraHeaders['Authorization'] = `Bearer ${settings.openclawApiKey}`;
    }

    return {
        baseUrl: effectiveBaseUrl,
        model: settings.openclawModel || 'ollama/kimi-k2.5:cloud',
        headers: extraHeaders
    };
};

export const fetchOpenClawModels = async (settings: LLMSettings): Promise<string[]> => {
    try {
        const config = getOpenClawConfig(settings);
        if (!config.baseUrl) return [];

        const response = await fetch(`${config.baseUrl}/v1/models`, {
            method: 'GET',
            headers: config.headers
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error body');
            console.error(`OpenClaw models fetch failed: ${response.status} ${response.statusText}`, errorText.slice(0, 500));
            return ['openclaw-agent'];
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text().catch(() => 'Unreadable body');
            console.warn(`OpenClaw fetch returned non-JSON (${contentType}):`, text.slice(0, 100) + '...');
            return ['openclaw-agent'];
        }

        const data = await response.json();
        return (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [])).map((m: any) => String(m?.id || m || 'unknown'));
    } catch (e: any) {
        if (!e.message?.includes('Failed to fetch') && !e.message?.includes('ECONNREFUSED') && !e.message?.includes('Load failed')) {
            console.error('OpenClaw models fetch error:', e);
        }
        return ['openclaw-agent'];
    }
};

export async function* enhancePromptOpenClawStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
    maxTokens: number = 2048
): AsyncGenerator<string> {
    try {
        const config = getOpenClawConfig(settings);
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
                max_tokens: maxTokens
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`OpenClaw Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("OpenClaw stream body is empty.");
        
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
                if (trimmed === 'data: [DONE]') break;
                
                try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                        // Track roughly by character count for local models if token count not provided
                        trackTokenUsage('openclaw', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'enhancing with OpenClaw');
    }
}

export async function* streamChatOpenClaw(
    messages: { role: 'user' | 'assistant' | 'system', content: string }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    try {
        const config = getOpenClawConfig(settings);
        
        const apiResponse = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: true,
                max_tokens: 4096
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`OpenClaw Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("OpenClaw stream body is empty.");
        
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
                        trackTokenUsage('openclaw', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'chatting with OpenClaw');
    }
}

export const refineSinglePromptOpenClaw = async (promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): Promise<string> => {
    try {
        const config = getOpenClawConfig(settings);
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
        
        if (!apiResponse.ok) throw new Error(`OpenClaw status: ${apiResponse.status}`);
        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        trackTokenUsage('openclaw', Math.ceil(content.length / 4));
        return content;
    } catch (err) {
        throw handleGeminiError(err, 'refining with OpenClaw');
    }
};

export async function* refineSinglePromptOpenClawStream(promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): AsyncGenerator<string> {
    // Re-use the existing stream logic
    yield* enhancePromptOpenClawStream(promptText, '', settings, systemInstruction, maxTokens);
}
