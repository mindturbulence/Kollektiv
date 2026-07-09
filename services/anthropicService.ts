import { LLMSettings } from '../types';
import { trackTokenUsage } from '../utils/settingsStorage';

export async function* streamChatAnthropic(
    messages: { role: 'user' | 'assistant' | 'system', content: string, attachments?: { data: string, mimeType: string, fileName?: string }[] }[],
    settings: LLMSettings
): AsyncGenerator<string> {
    const isSubscriptionMode = settings.anthropicConnectionMode === 'subscription';
    
    if (!isSubscriptionMode && !settings.anthropicApiKey) {
        yield "System: Anthropic API Key is missing. Please set it in Settings -> Integrations -> Anthropic.";
        return;
    }

    try {
        const response = await fetch("/api/anthropic/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages,
                settings,
                stream: true
            })
        });

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.message || `Anthropic proxy error: ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error("No response body from Anthropic proxy.");
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
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === '[DONE]') continue;
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            
                            // Anthropic SSE format has 'content_block_delta' events containing text
                            if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                                const text = data.delta.text;
                                estimatedTokens += Math.ceil(text.length / 4);
                                yield text;
                            }
                            // Also support OpenAI-compatible formatting if the proxy target is formatted that way
                            else if (data.choices && data.choices.length > 0) {
                                const delta = data.choices[0].delta;
                                if (delta && delta.content) {
                                    estimatedTokens += Math.ceil(delta.content.length / 4);
                                    yield delta.content;
                                }
                            }
                        } catch (e) {
                            // If it's a raw line or custom format that isn't strict JSON, ignore parsing error
                        }
                    }
                }
            }
        }

        trackTokenUsage('anthropic', estimatedTokens + 10); // Approximation
        
    } catch (e: any) {
        console.error("Anthropic Service Error:", e);
        yield `\n\n**Error calling Anthropic service:** ${e.message}\nIf this persists, please check your API key, connection mode, or proxy endpoint in Settings.`;
    }
}
