import { handleGeminiError } from '../utils/errorHandler'; 
import type { LLMSettings } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

/**
 * Checks if a URL is targeting the local machine's Hermes port.
 */
const sanitizeUrl = (url: string) => {
    if (!url || typeof url !== 'string') return '';
    let sanitized = url.trim().replace(/\/+$/, '');
    if (sanitized && !sanitized.startsWith('http') && !sanitized.startsWith('/')) {
        sanitized = 'http://' + sanitized;
    }
    return sanitized;
};

const getHermesConfig = (settings: LLMSettings) => {
    const rawBaseUrl = sanitizeUrl(settings.hermesBaseUrl || 'http://localhost:18789');
    
    let effectiveBaseUrl = rawBaseUrl;
    let extraHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (typeof window !== 'undefined') {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalHost && (rawBaseUrl.includes('localhost:18789') || rawBaseUrl.includes('127.0.0.1:18789'))) {
            effectiveBaseUrl = '/hermes-local';
        } else if (window.location.protocol === 'https:') {
            if ((rawBaseUrl.startsWith('http:') || rawBaseUrl.startsWith('https:')) && 
                !rawBaseUrl.includes('localhost') && 
                !rawBaseUrl.includes('127.0.0.1')) {
                effectiveBaseUrl = '/proxy-remote';
                extraHeaders['x-target-url'] = rawBaseUrl;
            }
        }
    }

    if (settings.hermesApiKey) {
        extraHeaders['Authorization'] = `Bearer ${settings.hermesApiKey}`;
    }

    return {
        baseUrl: effectiveBaseUrl,
        model: settings.hermesModel || 'hermes-agent',
        headers: extraHeaders
    };
};

export const fetchHermesModels = async (settings: LLMSettings): Promise<string[]> => {
    try {
        const config = getHermesConfig(settings);
        if (!config.baseUrl) return [];

        const response = await fetch(`${config.baseUrl}/v1/models`, {
            method: 'GET',
            headers: config.headers
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error body');
            console.error(`Hermes models fetch failed: ${response.status} ${response.statusText}`, errorText.slice(0, 500));
            return ['hermes-agent'];
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text().catch(() => 'Unreadable body');
            console.warn(`Hermes fetch returned non-JSON (${contentType}):`, text.slice(0, 100) + '...');
            return ['hermes-agent'];
        }

        const data = await response.json();
        return (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [])).map((m: any) => String(m?.id || m || 'unknown'));
    } catch (e: any) {
        if (!e.message?.includes('Failed to fetch') && !e.message?.includes('ECONNREFUSED') && !e.message?.includes('Load failed')) {
            console.error('Hermes models fetch error:', e);
        }
        return ['hermes-agent'];
    }
};

export async function* enhancePromptHermesStream(
    prompt: string,
    constantModifier: string,
    settings: LLMSettings,
    systemInstruction: string,
    maxTokens: number = 2048
): AsyncGenerator<string> {
    try {
        const config = getHermesConfig(settings);
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
            throw new Error(`Hermes Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("Hermes stream body is empty.");
        
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
                        trackTokenUsage('hermes', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'enhancing with Hermes');
    }
}

export async function* streamChatHermes(
    messages: { role: 'user' | 'assistant' | 'system', content: string, attachments?: { data: string, mimeType: string, fileName?: string }[] }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    try {
        const config = getHermesConfig(settings);
        
        const hermesMessages = messages.map(m => {
            if (m.attachments && m.attachments.length > 0) {
                const contentData: any[] = [{ type: 'text', text: m.content }];
                let skippedNotice = '';
                for (const att of m.attachments) {
                    if (att.mimeType.startsWith('image/')) {
                        contentData.push({
                            type: 'image_url',
                            image_url: { url: att.data } // Expects data URI
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
                messages: hermesMessages,
                stream: true,
                max_tokens: 4096
            }),
        });

        if (!apiResponse.ok) {
            throw new Error(`Hermes Stream failed (${apiResponse.status})`);
        }
        
        if (!apiResponse.body) throw new Error("Hermes stream body is empty.");
        
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
                        trackTokenUsage('hermes', Math.ceil(content.length / 4));
                    }
                } catch (e) {}
            }
        }
    } catch (err: any) {
        throw handleGeminiError(err, 'chatting with Hermes');
    }
}

export const refineSinglePromptHermes = async (promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): Promise<string> => {
    try {
        const config = getHermesConfig(settings);
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
        
        if (!apiResponse.ok) throw new Error(`Hermes status: ${apiResponse.status}`);
        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        trackTokenUsage('hermes', Math.ceil(content.length / 4));
        return content;
    } catch (err) {
        throw handleGeminiError(err, 'refining with Hermes');
    }
};

export async function* refineSinglePromptHermesStream(promptText: string, settings: LLMSettings, systemInstruction: string, maxTokens: number = 1024): AsyncGenerator<string> {
    // Re-use the existing stream logic
    yield* enhancePromptHermesStream(promptText, '', settings, systemInstruction, maxTokens);
}
