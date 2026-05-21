import { LLMSettings } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

export const fetchOpenRouterModels = async (): Promise<string[]> => {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models");
        if (!response.ok) return [];
        const data = await response.json();
        if (data && data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id);
        }
    } catch (e) {
        console.error("OpenRouter fetch models error:", e);
    }
    return [];
};

export async function* streamChatOpenRouter(
    messages: { role: 'user' | 'assistant' | 'system', content: string, attachments?: { data: string, mimeType: string, fileName?: string }[] }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    const apiKey = settings.openrouterApiKey;
    if (!apiKey) {
        yield "System: OpenRouter API Key is missing. Please set it in Settings -> Integrations -> OpenRouter.";
        return;
    }

    const modelName = settings.openrouterModel || 'openrouter/auto';

    // Format messages for OpenRouter (OpenAI-compatible)
    const formattedMessages = messages.map(msg => {
        let content: any = msg.content;
        
        if (msg.attachments && msg.attachments.length > 0) {
            content = [
                { type: "text", text: msg.content || " " }
            ];
            
            for (const att of msg.attachments) {
                if (att.mimeType.startsWith('image/')) {
                    // It's a base64 string starting with data:image/...
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: att.data
                        }
                    });
                }
            }
        }
        
        return {
            role: msg.role,
            content
        };
    });

    // Add master persona if present
    if (settings.masterRolePrompt && formattedMessages.length > 0 && formattedMessages[0].role !== 'system') {
        formattedMessages.unshift({
            role: 'system',
            content: settings.masterRolePrompt
        });
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin, // Optional, for including your app on openrouter.ai rankings.
                "X-Title": "Local AI Studio" // Optional. Shows in rankings on openrouter.ai.
            },
            body: JSON.stringify({
                model: modelName,
                messages: formattedMessages,
                stream: true
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenRouter Error ${response.status}: ${errText}`);
        }

        if (!response.body) {
            throw new Error("No response body from OpenRouter.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let estimatedTokens = 0;
        let buffer = "";

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Keep the last partial line in the buffer
                buffer = lines.pop() || '';
                
                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            // Sometimes line can be "data: data: {...}" if corrupted, but assume valid JSON for now.
                            const data = JSON.parse(line.slice(6));
                            if (data.choices && data.choices.length > 0) {
                                const delta = data.choices[0].delta;
                                if (delta && delta.content) {
                                    estimatedTokens += Math.ceil(delta.content.length / 4);
                                    yield delta.content;
                                }
                            }
                        } catch (e) {
                            console.warn("Failed to parse OpenRouter chunk:", line, e);
                        }
                    }
                }
            }
        }

        trackTokenUsage('openrouter', estimatedTokens + 10); // Approximation
        
    } catch (e: any) {
        console.error("OpenRouter API Error:", e);
        yield `\n\n**Error calling OpenRouter:** ${e.message}\nIf this persists, please check your API key and model tag in Settings.`;
    }
}
